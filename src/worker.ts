type OutputFormat = "json" | "pretty";
type Destination = "stdout" | "stderr" | { file: string } | { fd: number };

let BATCH = 64,
  INTERVAL = 200,
  FORMAT: OutputFormat = "json",
  DEST: Destination = "stdout",
  IS_TTY = false;

const q: Array<{
  t: number;
  level: string;
  msg: string;
  meta?: Record<string, unknown>;
}> = [];
let timer: Timer | null = null;
let fileWriter: any = null;

const COLORS: Record<string, string> = {
  debug: "\x1b[36m", // cyan
  info: "\x1b[32m", // green
  warn: "\x1b[33m", // yellow
  error: "\x1b[31m", // red
  reset: "\x1b[0m",
};

function formatLog(entry: {
  t: number;
  level: string;
  msg: string;
  meta?: Record<string, unknown>;
}): string {
  if (FORMAT === "json") {
    return JSON.stringify(entry);
  }

  const ts = new Date(entry.t).toISOString();
  const color = COLORS[entry.level] ?? "";
  const reset = COLORS.reset;
  const level = entry.level.toUpperCase().padEnd(5);
  const metaStr = entry.meta ? ` ${JSON.stringify(entry.meta)}` : "";

  if (IS_TTY) {
    return `${color}${level}${reset} [${ts}] ${entry.msg}${metaStr}`;
  }
  return `${level} [${ts}] ${entry.msg}${metaStr}`;
}

async function getWriter() {
  if (fileWriter) return fileWriter;

  if (typeof DEST === "string") {
    return DEST === "stdout" ? Bun.stdout : Bun.stderr;
  }

  if ("file" in DEST) {
    fileWriter = Bun.file(DEST.file).writer();
    return fileWriter;
  }

  if ("fd" in DEST) {
    return Bun.file(DEST.fd);
  }

  return Bun.stdout;
}

function schedule() {
  if (timer) return;
  timer = setTimeout(async () => {
    timer = null;
    if (q.length === 0) return;
    await flushNow();
  }, INTERVAL);
}

async function flushNow() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (q.length === 0) return;

  const count = q.length;
  const lines = q.splice(0, count);
  const chunk = lines.map(formatLog).join("\n") + "\n";

  try {
    const writer = await getWriter();

    if (fileWriter && writer === fileWriter) {
      // FileSink uses .write() method
      writer.write(chunk);
      await writer.flush();
    } else {
      // BunFile uses Bun.write()
      await Bun.write(writer, chunk);
    }

    (self as any).postMessage({ __processed: count });
  } catch (err) {
    (self as any).postMessage({ __error: String(err) });
    // Fallback: try stderr if stdout failed
    if (DEST === "stdout") {
      try {
        await Bun.write(Bun.stderr, chunk);
      } catch {}
    }
  }
}

self.onmessage = (e: MessageEvent) => {
  const d = e.data;
  if (d?.__init) {
    BATCH = d.batchSize ?? 64;
    INTERVAL = d.flushInterval ?? 200;
    FORMAT = d.format ?? "json";
    DEST = d.destination ?? "stdout";
    IS_TTY = d.isTTY ?? false;
    return;
  }
  if (d?.__flush) {
    (async () => {
      await flushNow();
      (self as any).postMessage({ __flushed: d.__flush });
    })();
    return;
  }
  q.push(d);
  if (q.length >= BATCH)
    (async () => {
      await flushNow();
    })();
  else schedule();
};
