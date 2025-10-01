type LogLevel = "debug" | "info" | "warn" | "error";
const LEVEL: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export type OutputFormat = "json" | "pretty" | "raw";
export type OutputDestination = "stdout" | "stderr" | { file: string } | { fd: number };

export type Color =
  | "black"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "white"
  | "gray"
  | "mint"
  | "brightRed"
  | "brightGreen"
  | "brightYellow"
  | "brightBlue"
  | "brightMagenta"
  | "brightCyan"
  | "brightWhite";

export interface CustomColors {
  debug?: Color;
  info?: Color;
  warn?: Color;
  error?: Color;
}

const COLOR_MAP: Record<Color, string> = {
  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
  mint: "\x1b[96m", // bright cyan alias
  brightRed: "\x1b[91m",
  brightGreen: "\x1b[92m",
  brightYellow: "\x1b[93m",
  brightBlue: "\x1b[94m",
  brightMagenta: "\x1b[95m",
  brightCyan: "\x1b[96m",
  brightWhite: "\x1b[97m",
};

export interface LoggerOptions {
  level?: LogLevel;
  batchSize?: number; // default 64
  flushInterval?: number; // default 200 ms
  format?: OutputFormat; // default "json"
  destination?: OutputDestination; // default "stdout"
  maxQueueSize?: number; // default 1024 (backpressure)
  onError?: (err: Error) => void; // error callback
  colors?: CustomColors; // custom colors for pretty format
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

  // Detect TTY for color support
  // For stdout/stderr, assume TTY and enable colors in pretty mode
  const dest = opts.destination ?? "stdout";
  const isTTY = typeof dest === "string" && (dest === "stdout" || dest === "stderr");

  // Convert color names to ANSI codes
  const ansiColors = opts.colors
    ? Object.entries(opts.colors).reduce((acc, [level, color]) => {
        acc[level] = COLOR_MAP[color];
        return acc;
      }, {} as Record<string, string>)
    : undefined;

  worker.postMessage({
    __init: true,
    batchSize: opts.batchSize ?? 64,
    flushInterval: opts.flushInterval ?? 200,
    format: opts.format ?? "json",
    destination: opts.destination ?? "stdout",
    isTTY,
    colors: ansiColors,
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
