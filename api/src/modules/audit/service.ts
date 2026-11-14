import { redact } from "../../core/redact.js";
import type { Logger } from "../../core/logger.js";
import type { AuditListOptions, AuditRepository } from "./repository.js";
import type { AuditEvent, AuditEventInput } from "./types.js";

const MAX_DATA_BYTES = 8 * 1024;

/**
 * Records audit events without ever failing the request that caused them:
 * a write error is logged and swallowed. Data is redacted and size-capped.
 */
export class AuditTrail {
  private readonly log: Logger;

  constructor(
    private readonly repository: AuditRepository | null,
    logger: Logger,
    private readonly options: { readonly enabled: boolean; readonly retentionDays: number },
  ) {
    this.log = logger.child({ category: "audit" });
  }

  get enabled(): boolean {
    return this.options.enabled && this.repository !== null;
  }

  async record(event: AuditEventInput): Promise<void> {
    this.log.debug("audit.event", {
      kind: event.kind,
      source: event.source,
      summary: event.summary,
      traceId: event.traceId,
    });

    if (!this.enabled) return;

    try {
      await this.repository!.insert({ ...event, data: capData(event.data) });
    } catch (error) {
      this.log.error("audit.write_failed", { kind: event.kind, error });
    }
  }

  async list(userId: string, options: AuditListOptions): Promise<readonly AuditEvent[]> {
    if (!this.enabled) return [];
    return this.repository!.listForUser(userId, options);
  }

  /** Deletes events older than the retention window; returns rows removed. */
  async prune(): Promise<number> {
    if (!this.enabled) return 0;
    try {
      const removed = await this.repository!.deleteOlderThan(this.options.retentionDays);
      if (removed > 0) this.log.info("audit.pruned", { removed, retentionDays: this.options.retentionDays });
      return removed;
    } catch (error) {
      this.log.error("audit.prune_failed", { error });
      return 0;
    }
  }
}

function capData(data: Record<string, unknown> | undefined): Record<string, unknown> {
  const safe = (redact(data ?? {}) ?? {}) as Record<string, unknown>;
  const json = JSON.stringify(safe);
  if (Buffer.byteLength(json) <= MAX_DATA_BYTES) return safe;
  return { truncated: true, bytes: Buffer.byteLength(json), keys: Object.keys(safe).slice(0, 30) };
}
