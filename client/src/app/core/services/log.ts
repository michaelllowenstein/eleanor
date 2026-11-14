import { Injectable, inject } from "@angular/core";

import { env } from "../../../envs/env";
import type { ClientLogConfig, ClientLogLevel, ClientLogLevels } from "../../../types";
import { redact } from "../schema/utils/redact";
import { AuthService } from "./auth";

/** Must match CLIENT_AUDIT_KINDS in api/src/modules/audit/types.ts. */
export type ClientAuditKind =
  | "realtime.settings_applied"
  | "realtime.turn"
  | "realtime.response"
  | "realtime.error"
  | "realtime.session_ended";

export interface LogEntry {
  /** Epoch ms. */
  readonly t: number;
  readonly level: ClientLogLevel;
  readonly category: string;
  readonly message: string;
  readonly traceId?: string;
  readonly data?: Record<string, unknown>;
  readonly audit?: { readonly kind: ClientAuditKind; readonly summary: string };
}

export interface ScopedLogger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  /** Records a user-visible audit event (always buffered; sent when audit is on). */
  audit(kind: ClientAuditKind, summary: string, data?: Record<string, unknown>): void;
  /** A logger for a sub-category, e.g. scope("realtime").child("webrtc") → "realtime.webrtc". */
  child(category: string): ScopedLogger;
  /** True when a line at `level` would reach the console or the API. */
  enabled(level: ClientLogLevel): boolean;
}

/** For code paths that may run without a LogService (tests, the mock transport). */
export const NOOP_LOGGER: ScopedLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  audit: () => undefined,
  child: () => NOOP_LOGGER,
  enabled: () => false,
};

const ORDER: Record<string, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const OVERRIDE_KEY = "eleanor.log";
const MAX_QUEUE = 1_000;

/**
 * Client-side logging, tracing and audit capture.
 *
 * Three sinks, each with its own per-category thresholds:
 *  - console        → env.logging.console
 *  - API (batched)  → env.logging.remote, POST /api/telemetry/client, so
 *                     browser events appear in Railway logs next to API logs
 *  - flight recorder→ the last `bufferSize` entries at every level, kept in
 *                     memory; download with eleanorLog.download()
 *
 * Every voice session gets a trace id (beginTrace). It is sent as
 * X-Eleanor-Trace-Id on the SDP exchange and on every telemetry event, so one
 * search for the id in the platform logs shows the browser side, the API side
 * and the provider call together.
 *
 * Runtime overrides (no rebuild), from the devtools console:
 *   eleanorLog.set({ console: { "*": "debug" }, remote: { realtime: "debug" } })
 *   eleanorLog.reset()       eleanorLog.config()
 *   eleanorLog.dump()        eleanorLog.download()   eleanorLog.flush()
 * Overrides persist in localStorage under "eleanor.log".
 */
@Injectable({ providedIn: "root" })
export class LogService {
  private readonly auth = inject(AuthService);

  private config: ClientLogConfig = this.loadConfig();
  private readonly buffer: LogEntry[] = [];
  private queue: LogEntry[] = [];
  private flushing = false;
  private trace: string | undefined;
  private timer: ReturnType<typeof setInterval> | null = null;

  /** One id per page load, to tell tabs apart in the API logs. */
  readonly clientId = randomId();

  constructor() {
    this.restartTimer();

    if (typeof window !== "undefined") {
      window.addEventListener("pagehide", () => void this.flush(true));
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") void this.flush(true);
      });
      this.exposeDevHandle();
    }
  }

  scope(category: string): ScopedLogger {
    return this.scoped(category);
  }

  /** Starts a new trace (one voice session) and returns its id. */
  beginTrace(): string {
    this.trace = randomId();
    return this.trace;
  }

  endTrace(): void {
    this.trace = undefined;
  }

  currentTrace(): string | undefined {
    return this.trace;
  }

  /** Sends queued entries now. `keepalive` lets the request outlive the page. */
  async flush(keepalive = false): Promise<void> {
    if (this.flushing || this.queue.length === 0) return;
    if (!this.auth.authenticated()) {
      // Keep entries until sign-in completes, but never grow without bound.
      if (this.queue.length > MAX_QUEUE) this.queue = this.queue.slice(-MAX_QUEUE);
      return;
    }

    let csrf: Record<string, string>;
    try {
      csrf = this.auth.csrfHeaders();
    } catch {
      return;
    }

    const batch = this.queue.splice(0, this.config.maxBatch as unknown as number);
    this.flushing = true;

    try {
      const response = await fetch("/api/telemetry/client", {
        method: "POST",
        credentials: "include",
        keepalive,
        headers: { "Content-Type": "application/json", ...csrf },
        body: JSON.stringify({
          clientId: this.clientId,
          appVersion: env.appVersion,
          events: batch,
        }),
      });

      // Retry later on rate limiting or server trouble; drop on client errors
      // (a malformed batch would fail forever).
      if (response.status === 429 || response.status >= 500) this.requeue(batch);
    } catch {
      this.requeue(batch);
    } finally {
      this.flushing = false;
    }

    if (this.queue.length >= batch.length && !keepalive) void this.flush();
  }

  dump(): readonly LogEntry[] {
    return [...this.buffer];
  }

  download(): void {
    const blob = new Blob(
      [JSON.stringify({ clientId: this.clientId, appVersion: env.appVersion, entries: this.buffer }, null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `eleanor-trace-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  setConfig(partial: Partial<ClientLogConfig>): ClientLogConfig {
    const merged = mergeConfig(this.config, partial);
    this.config = merged;
    try {
      const stored = JSON.parse(localStorage.getItem(OVERRIDE_KEY) ?? "{}") as Partial<ClientLogConfig>;
      localStorage.setItem(OVERRIDE_KEY, JSON.stringify(mergeConfig(stored as ClientLogConfig, partial)));
    } catch {
      // Storage may be unavailable (private mode); the change still applies.
    }
    this.restartTimer();
    return merged;
  }

  resetConfig(): ClientLogConfig {
    try {
      localStorage.removeItem(OVERRIDE_KEY);
    } catch {
      // ignore
    }
    this.config = { ...env.logging } as unknown as ClientLogConfig;
    this.restartTimer();
    return this.config;
  }

  // ── internals ──────────────────────────────────────────────────────────

  private scoped(category: string): ScopedLogger {
    const write = (level: ClientLogLevel, message: string, data?: Record<string, unknown>) =>
      this.write({ level, category, message, data });

    const logger: ScopedLogger = {
      debug: (m, d) => write("debug", m, d),
      info: (m, d) => write("info", m, d),
      warn: (m, d) => write("warn", m, d),
      error: (m, d) => write("error", m, d),
      audit: (kind, summary, data) =>
        this.write({ level: "info", category, message: `audit.${kind}`, data, audit: { kind, summary } }),
      child: (sub) => this.scoped(`${category}.${sub}`),
      enabled: (level) =>
        passes(this.config.console, category, level) || passes(this.config.remote, category, level),
    };
    return logger;
  }

  private write(input: {
    level: ClientLogLevel;
    category: string;
    message: string;
    data?: Record<string, unknown>;
    audit?: LogEntry["audit"];
  }): void {
    const entry: LogEntry = {
      t: Date.now(),
      level: input.level,
      category: input.category,
      message: input.message,
      ...(this.trace ? { traceId: this.trace } : {}),
      ...(input.data ? { data: redact(input.data) as Record<string, unknown> } : {}),
      ...(input.audit ? { audit: input.audit } : {}),
    };

    this.buffer.push(entry);
    if (this.buffer.length > this.config.bufferSize) {
      this.buffer.splice(0, this.buffer.length - this.config.bufferSize);
    }

    if (passes(this.config.console, entry.category, entry.level)) printToConsole(entry);

    const sendAudit = Boolean(entry.audit) && this.config.audit;
    if (sendAudit || passes(this.config.remote, entry.category, entry.level)) {
      this.queue.push(entry);
      if (this.queue.length > MAX_QUEUE) this.queue.splice(0, this.queue.length - MAX_QUEUE);
      if (entry.level === "error" || this.queue.length >= (this.config.maxBatch as unknown as number)) {
        void this.flush();
      }
    }
  }

  private requeue(batch: LogEntry[]): void {
    this.queue = [...batch, ...this.queue].slice(-MAX_QUEUE);
  }

  private restartTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => void this.flush(), this.config.flushIntervalMs as unknown as number);
  }

  private loadConfig(): ClientLogConfig {
    const base = { ...env.logging } as unknown as ClientLogConfig;
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem(OVERRIDE_KEY) : null;
      return raw ? mergeConfig(base, JSON.parse(raw) as Partial<ClientLogConfig>) : base;
    } catch {
      return base;
    }
  }

  private exposeDevHandle(): void {
    (globalThis as unknown as Record<string, unknown>)["eleanorLog"] = {
      config: () => this.config,
      set: (partial: Partial<ClientLogConfig>) => this.setConfig(partial),
      reset: () => this.resetConfig(),
      dump: () => this.dump(),
      download: () => this.download(),
      flush: () => this.flush(),
      trace: () => this.trace,
    };
  }
}

function passes(levels: ClientLogLevels, category: string, level: ClientLogLevel): boolean {
  const prefix = category.split(".")[0] ?? category;
  const levelMap = levels as unknown as Record<string, ClientLogLevel | "off" | undefined>;
  const threshold = levelMap[category] ?? levelMap[prefix] ?? levelMap["*"] ?? "info";
  return threshold !== "off" && ORDER[level as keyof typeof ORDER] >= ORDER[threshold as keyof typeof ORDER];
}

function mergeConfig(base: ClientLogConfig, partial: Partial<ClientLogConfig>): ClientLogConfig {
  return {
    ...base,
    ...partial,
    console: { ...(base.console ?? {}), ...(partial.console ?? {}) } as ClientLogConfig["console"],
    remote: partial.remote ?? base.remote,
  };
}

const CONSOLE_STYLE = new Map<ClientLogLevel, string>([
  ["debug", "color:#64748b"],
  ["info", "color:#38c4ff"],
  ["warn", "color:#f59e0b"],
  ["error", "color:#f43f5e"],
]);

function printToConsole(entry: LogEntry): void {
  const method: ClientLogLevel = entry.level;
  const trace = entry.traceId ? ` · ${entry.traceId.slice(0, 8)}` : "";
  (console as unknown as Record<string, (...args: unknown[]) => void>)[method as string](
    `%c[${entry.category}]%c ${entry.message}${trace}`,
    CONSOLE_STYLE.get(entry.level) ?? "",
    "",
    ...(entry.data ? [entry.data] : []),
  );
}

function randomId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
