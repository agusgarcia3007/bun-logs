type LogLevel = "debug" | "info" | "warn" | "error";
const LEVEL: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export type OutputFormat = "json" | "pretty";
export type OutputDestination = "stdout" | "stderr" | { file: string } | { fd: number };

export interface LoggerOptions {
  level?: LogLevel;
  batchSize?: number; // default 64
  flushInterval?: number; // default 200 ms
  format?: OutputFormat; // default "json"
  destination?: OutputDestination; // default "stdout"
  maxQueueSize?: number; // default 1024 (backpressure)
  onError?: (err: Error) => void; // error callback
}

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  flush(): Promise<void>;
  close(): Promise<void>;
}

export function createLogger(opts: LoggerOptions = {}): Logger {
  const min = LEVEL[opts.level ?? "info"];
  const maxQueue = opts.maxQueueSize ?? 1024;
  const onError = opts.onError ?? ((err: Error) => console.error("[bun-logger]", err));

  let queueSize = 0;
  let dropped = 0;

  const worker = new Worker(new URL("./worker.ts", import.meta.url).href, {
    type: "module",
  });

  worker.onerror = (err) => onError(new Error(`Worker error: ${err.message}`));

  worker.onmessage = (e: MessageEvent) => {
    if (e.data?.__processed !== undefined) {
      queueSize = Math.max(0, queueSize - e.data.__processed);
    }
    if (e.data?.__error) {
      onError(new Error(e.data.__error));
    }
  };

  worker.postMessage({
    __init: true,
    batchSize: opts.batchSize ?? 64,
    flushInterval: opts.flushInterval ?? 200,
    format: opts.format ?? "json",
    destination: opts.destination ?? "stdout",
  });

  function post(lvl: LogLevel, msg: string, meta?: Record<string, unknown>) {
    if (LEVEL[lvl] < min) return;

    if (queueSize >= maxQueue) {
      dropped++;
      if (dropped === 1 || dropped % 100 === 0) {
        onError(new Error(`Queue overflow: dropped ${dropped} logs`));
      }
      return;
    }

    queueSize++;
    worker.postMessage({ t: Date.now(), level: lvl, msg, meta });
  }

  function flush(): Promise<void> {
    return new Promise((resolve) => {
      const id = Math.random().toString(36).slice(2);
      const on = (e: MessageEvent) => {
        if (e.data?.__flushed === id) {
          worker.removeEventListener("message", on);
          resolve();
        }
      };
      worker.addEventListener("message", on);
      worker.postMessage({ __flush: id });
    });
  }

  async function close() {
    await flush();
    worker.terminate();
  }

  return {
    debug: (m, meta) => post("debug", m, meta),
    info: (m, meta) => post("info", m, meta),
    warn: (m, meta) => post("warn", m, meta),
    error: (m, meta) => post("error", m, meta),
    flush,
    close,
  };
}
