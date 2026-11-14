import { Injectable, signal } from "@angular/core";

/** Mirrors AuditEvent in api/src/modules/audit/types.ts. */
export interface AuditEvent {
  readonly id: string;
  readonly kind: string;
  readonly source: "api" | "client";
  readonly summary: string;
  readonly traceId: string | null;
  readonly data: Record<string, unknown>;
  readonly occurredAt: string;
}

/**
 * Reads the signed-in user's audit trail (GET /api/audit-trail).
 * Groundwork for a future "what Eleanor did and why" view: each voice
 * session is one traceId, so `load({ traceId })` returns a whole session —
 * the settings in force, every response with its latency and token usage,
 * interruptions and errors.
 */
@Injectable({ providedIn: "root" })
export class AuditTrailService {
  readonly events = signal<readonly AuditEvent[]>([]);
  readonly enabled = signal(true);
  readonly next = signal<string | null>(null);

  async load(options: { readonly traceId?: string; readonly limit?: number; readonly before?: string } = {}): Promise<void> {
    const query = new URLSearchParams();
    if (options.limit) query.set("limit", String(options.limit));
    if (options.before) query.set("before", options.before);
    if (options.traceId) query.set("traceId", options.traceId);

    const response = await fetch(`/api/audit-trail?${query.toString()}`, {
      credentials: "include",
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Unable to load the audit trail (${response.status}).`);
    }

    const payload = (await response.json()) as {
      readonly enabled: boolean;
      readonly events: readonly AuditEvent[];
      readonly next: string | null;
    };

    this.enabled.set(payload.enabled);
    this.events.set(options.before ? [...this.events(), ...payload.events] : payload.events);
    this.next.set(payload.next);
  }
}
