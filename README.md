# bun-logs

Ultra-light, Bun-first async logger with batching & worker offload. Designed to keep your event loop free.

## Why?

`console.log` blocks the event loop. In high-throughput applications, logging can become a bottleneck. `bun-logs` offloads all I/O to a dedicated Worker thread, batches writes, and never blocks your main thread.

## Features

- **Non-blocking**: All I/O happens in a Worker thread
- **Batching**: Configurable batch size and flush interval
- **Backpressure**: Queue overflow protection with automatic drop counter and warning logs
- **Multiple outputs**: stdout, stderr, or file paths (with append mode)
- **Formats**: JSON (structured), pretty (human-readable with colors), or raw (message only)
- **Graceful shutdown**: Automatic flush on SIGINT/SIGTERM
- **Zero dependencies**: Pure Bun APIs
- **Tiny**: ~4KB packed, < 200 LOC total

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
  format: "pretty",            // "json" | "pretty" | "raw" (default: "json")
  destination: "stderr",       // "stdout" | "stderr" | "./path/to/file.log" (default: "stdout")
  batchSize: 128,              // Flush after N logs (default: 64)
  flushInterval: 100,          // Flush after N ms (default: 200)
  maxQueueSize: 20000,         // Backpressure threshold (default: 10000)
  onError: (err) => {          // Error handler (default: console.error)
    console.error("Logger error:", err);
  },
});
```

### Log to file

```ts
const logger = createLogger({
  format: "json",
  destination: "./logs/app.log", // File opened once in append mode
});

logger.info("Request received", { method: "GET", path: "/" });
// File handle is cached and reused for all writes
```

### Log to stderr

```ts
const logger = createLogger({
  format: "json",
  destination: "stderr", // Send logs to stderr instead of stdout
});

logger.error("Critical error", { code: "E001" });
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

### Raw format (message only)

```ts
const logger = createLogger({
  format: "raw",
});

logger.info("Server started on port 3000");
logger.info("✅ All systems operational");

// Output (just the message):
// Server started on port 3000
// ✅ All systems operational
```

### Custom colors

```ts
const logger = createLogger({
  format: "pretty",
  colors: {
    error: "brightRed",
    warn: "brightYellow",
    info: "mint",
    // debug keeps default cyan
  },
});
```

**Available colors:**
- Basic: `black`, `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `white`, `gray`, `mint`
- Bright: `brightRed`, `brightGreen`, `brightYellow`, `brightBlue`, `brightMagenta`, `brightCyan`, `brightWhite`

## API

### `createLogger(options?): Logger`

Creates a logger instance.

**Options:**
- `level?: "debug" | "info" | "warn" | "error"` - Minimum log level (default: `"info"`)
- `format?: "json" | "pretty" | "raw"` - Output format (default: `"json"`)
- `destination?: "stdout" | "stderr" | string` - Output destination (default: `"stdout"`) - string is a file path
- `batchSize?: number` - Number of logs to batch before flushing (default: `64`)
- `flushInterval?: number` - Maximum time (ms) before flushing (default: `200`)
- `maxQueueSize?: number` - Max queue size for backpressure (default: `10000`)
- `onError?: (err: Error) => void` - Error callback
- `colors?: { debug?, info?, warn?, error? }` - Custom colors for pretty format (see available colors above)

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
