# bun-logs

Ultra-light, Bun-first async logger with batching & worker offload. Designed to keep your event loop free.

## Why?

`console.log` blocks the event loop. In high-throughput applications, logging can become a bottleneck. `bun-logs` offloads all I/O to a dedicated Worker thread, batches writes, and never blocks your main thread.

## Features

- **Non-blocking**: All I/O happens in a Worker thread
- **Batching**: Configurable batch size and flush interval
- **Backpressure**: Queue overflow protection with drop reporting
- **Multiple outputs**: stdout, stderr, files, or custom file descriptors
- **Formats**: JSON (structured) or pretty (human-readable with colors)
- **Zero dependencies**: Pure Bun APIs
- **Tiny**: 4KB packed, < 200 LOC total

## Installation

```bash
bun add bun-logs
```

## Usage

### Basic

```ts
import { createLogger } from "bun-logs";

const logger = createLogger();

logger.info("Server started", { port: 3000 });
logger.warn("High memory usage", { usage: "85%" });
logger.error("Database connection failed", { error: "timeout" });

// Ensure all logs are written before exit
await logger.close();
```

### Configuration

```ts
const logger = createLogger({
  level: "debug",              // Minimum log level (default: "info")
  format: "pretty",            // "json" | "pretty" (default: "json")
  destination: "stderr",       // "stdout" | "stderr" | { file: "app.log" } | { fd: 3 }
  batchSize: 128,              // Flush after N logs (default: 64)
  flushInterval: 100,          // Flush after N ms (default: 200)
  maxQueueSize: 2048,          // Backpressure threshold (default: 1024)
  onError: (err) => {          // Error handler (default: console.error)
    console.error("Logger error:", err);
  },
});
```

### Log to file

```ts
const logger = createLogger({
  format: "json",
  destination: { file: "./logs/app.log" },
});

logger.info("Request received", { method: "GET", path: "/" });
```

### Pretty output for development

```ts
const logger = createLogger({
  format: "pretty",
  level: "debug",
});

// Output with colors (when TTY):
// INFO  [2025-10-01T12:34:56.789Z] User logged in {"userId":"123"}
```

## API

### `createLogger(options?): Logger`

Creates a logger instance.

**Options:**
- `level?: "debug" | "info" | "warn" | "error"` - Minimum log level
- `format?: "json" | "pretty"` - Output format
- `destination?: "stdout" | "stderr" | { file: string } | { fd: number }` - Output destination
- `batchSize?: number` - Number of logs to batch before flushing
- `flushInterval?: number` - Maximum time (ms) before flushing
- `maxQueueSize?: number` - Max queue size for backpressure
- `onError?: (err: Error) => void` - Error callback

### `Logger`

**Methods:**
- `debug(msg: string, meta?: Record<string, unknown>): void`
- `info(msg: string, meta?: Record<string, unknown>): void`
- `warn(msg: string, meta?: Record<string, unknown>): void`
- `error(msg: string, meta?: Record<string, unknown>): void`
- `flush(): Promise<void>` - Flush all pending logs
- `close(): Promise<void>` - Flush and terminate worker

## Performance

Offloading to a Worker means your main thread stays responsive even under heavy logging:

```ts
const logger = createLogger();

// Log 10k messages - returns immediately
for (let i = 0; i < 10000; i++) {
  logger.info("Message", { idx: i });
}
// Main thread is still free! 🚀
```

### Benchmark Results (100k logs)

```
┌─────────────────────────┬──────────┬──────────┬──────────┬─────────────┐
│ Method                  │ Loop (ms)│ Total(ms)│ Mem (MB) │ Throughput  │
├─────────────────────────┼──────────┼──────────┼──────────┼─────────────┤
│ console.log (file)      │     1652 │     1652 │     0.00 │       60516 │
│ bun-logs (JSON)         │       57 │       59 │     0.12 │     1709148 │
│ bun-logs (pretty)       │       59 │       63 │     0.03 │     1580062 │
│ bun-logs (stdout)       │       61 │      439 │     0.00 │      227640 │
│ bun-logs (stderr)       │       48 │      409 │     0.00 │      244323 │
└─────────────────────────┴──────────┴──────────┴──────────┴─────────────┘

🔥 Key Insights:
- ⚡ 28x faster than blocking I/O
- 🚀 Event loop freed 29x faster
- 💨 Main thread available immediately (only 57ms blocked vs 1652ms)
```

## License

MIT
