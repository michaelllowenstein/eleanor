import type { LogLevel } from "./config.js";
import { currentContext } from "./context.js";
import { redact } from "./redact.js";

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  /** A logger whose lines carry `bindings` (use `category` to tag a subsystem). */
  child(bindings: LogFields & { readonly category?: string }): Logger;
  /** True when a line at `level` would be written; use to skip costly fields. */
  enabled(level: LogLevel): boolean;
}

export interface LoggerOptions {
  /** Default level for every category. */
  readonly level: LogLevel;
  /** Per-category overrides, e.g. { realtime: "debug", http: "warn" }. */
  readonly trace?: Readonly<Record<string, LogLevel>>;
  readonly format?: "json" | "pretty";
  readonly service?: string;
}

/**
 * Structured logger: one line per event on stdout/stderr.
 *
 * JSON lines use `level` and `message` keys, which Railway's log explorer
 * parses into filterable attributes (e.g. `@level:warn`, `@category:provider`).
 * Request context (requestId, traceId, userRef) is merged in automatically and
 * every field passes through redact(). Still: never pass API keys, raw SDP or
 * user utterances on purpose.
 *
 * Category levels: a line in category "client.webrtc" uses the first match of
 * trace["client.webrtc"], trace["client"], trace["*"], then `level`.
 */
export function createLogger(
  levelOrOptions: LogLevel | LoggerOptions = "info",
): Logger {
  const options: LoggerOptions =
    typeof levelOrOptions === "string" ? { level: levelOrOptions } : levelOrOptions;
  return build(options, {});
}

function build(options: LoggerOptions, bindings: LogFields): Logger {
  const category = typeof bindings.category === "string" ? bindings.category : "app";
  const threshold = ORDER[thresholdFor(options, category)];
  const format = options.format ?? "json";

  const write = (level: LogLevel, message: string, fields?: LogFields) => {
    if (ORDER[level] < threshold) return;

    const context = currentContext();
    const record: LogFields = {
      time: new Date().toISOString(),
      level,
      category,
      message,
      ...(options.service ? { service: options.service } : {}),
      ...(context?.requestId ? { requestId: context.requestId } : {}),
      ...(context?.traceId ? { traceId: context.traceId } : {}),
      ...(context?.userRef ? { userRef: context.userRef } : {}),
      ...(redact(withoutCategory(bindings)) as LogFields),
      ...(redact(fields ?? {}) as LogFields),
    };

    const line = format === "pretty" ? pretty(record) : safeStringify(record);
    (level === "error" || level === "warn" ? process.stderr : process.stdout).write(`${line}\n`);
  };

  return {
    debug: (m, f) => write("debug", m, f),
    info: (m, f) => write("info", m, f),
    warn: (m, f) => write("warn", m, f),
    error: (m, f) => write("error", m, f),
    child: (more) => build(options, { ...bindings, ...more }),
    enabled: (level) => ORDER[level] >= threshold,
  };
}

function thresholdFor(options: LoggerOptions, category: string): LogLevel {
  const trace = options.trace ?? {};
  const prefix = category.split(".")[0] ?? category;
  return trace[category] ?? trace[prefix] ?? trace["*"] ?? options.level;
}

function withoutCategory(bindings: LogFields): LogFields {
  const { category: _category, ...rest } = bindings;
  return rest;
}

function safeStringify(record: LogFields): string {
  try {
    return JSON.stringify(record);
  } catch {
    return JSON.stringify({
      time: record.time,
      level: record.level,
      category: record.category,
      message: record.message,
      note: "fields could not be serialised",
    });
  }
}

const COLOUR: Record<string, string> = {
  debug: "\x1b[90m",
  info: "\x1b[36m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
};

function pretty(record: LogFields): string {
  const { time, level, category, message, requestId, traceId, userRef, service: _s, ...rest } =
    record;
  const ids = [
    traceId ? `t:${String(traceId).slice(0, 8)}` : "",
    requestId ? `r:${String(requestId).slice(0, 8)}` : "",
    userRef ? `u:${String(userRef)}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const extra = Object.keys(rest).length ? ` ${safeStringify(rest)}` : "";
  const colour = COLOUR[String(level)] ?? "";
  return `${String(time).slice(11, 23)} ${colour}${String(level).toUpperCase().padEnd(5)}\x1b[0m [${String(category)}] ${String(message)}${ids ? ` (${ids})` : ""}${extra}`;
}

/** Parses LOG_TRACE, e.g. "realtime=debug,provider=debug,http=warn,*=info". */
export function parseTraceSpec(spec: string | undefined): {
  readonly trace: Record<string, LogLevel>;
  readonly problems: string[];
} {
  const trace: Record<string, LogLevel> = {};
  const problems: string[] = [];
  for (const part of (spec ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    const [name, level] = part.split("=").map((s) => s.trim());
    if (!name || !level || !(level in ORDER)) {
      problems.push(`LOG_TRACE entry "${part}" must look like category=debug|info|warn|error.`);
      continue;
    }
    trace[name] = level as LogLevel;
  }
  return { trace, problems };
}

export const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  child: () => silentLogger,
  enabled: () => false,
};
