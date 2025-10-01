export type LogLevel = "debug" | "info" | "warn" | "error";

export type OutputDestination =
  | "stdout"
  | "stderr"
  | string
  | { file: string }
  | { fd: number };

export type OutputFormat = "json" | "pretty" | "raw";

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

export interface LoggerOptions {
  level?: LogLevel;
  batchSize?: number;
  flushInterval?: number;
  format?: OutputFormat;
  destination?: OutputDestination;
  maxQueueSize?: number;
  onError?: (err: Error) => void;
  colors?: CustomColors;
}

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  flush(): Promise<void>;
  close(): Promise<void>;
}

export function createLogger(opts?: LoggerOptions): Logger;
