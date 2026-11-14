import type { Pool } from "pg";

import type { AuditEvent, AuditEventInput, AuditKind } from "./types.js";

interface Row {
  readonly id: string;
  readonly kind: AuditKind;
  readonly source: "api" | "client";
  readonly summary: string;
  readonly trace_id: string | null;
  readonly data: Record<string, unknown>;
  readonly occurred_at: Date;
}

export interface AuditListOptions {
  readonly limit: number;
  /** Return events strictly older than this id (keyset pagination). */
  readonly beforeId?: string;
  readonly traceId?: string;
}

export interface AuditRepository {
  insert(event: AuditEventInput): Promise<void>;
  listForUser(userId: string, options: AuditListOptions): Promise<readonly AuditEvent[]>;
  deleteOlderThan(days: number): Promise<number>;
}

export function createAuditRepository(database: Pool): AuditRepository {
  return {
    async insert(event) {
      await database.query(
        `
          INSERT INTO audit_events (user_id, trace_id, kind, source, summary, data, occurred_at)
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, COALESCE($7, NOW()))
        `,
        [
          event.userId,
          event.traceId ?? null,
          event.kind,
          event.source,
          event.summary,
          JSON.stringify(event.data ?? {}),
          event.occurredAt ?? null,
        ],
      );
    },

    async listForUser(userId, options) {
      const result = await database.query<Row>(
        `
          SELECT id::text AS id, kind, source, summary, trace_id, data, occurred_at
          FROM audit_events
          WHERE user_id = $1
            AND ($2::bigint IS NULL OR id < $2::bigint)
            AND ($3::text IS NULL OR trace_id = $3::text)
          ORDER BY id DESC
          LIMIT $4
        `,
        [userId, options.beforeId ?? null, options.traceId ?? null, options.limit],
      );

      return result.rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        source: row.source,
        summary: row.summary,
        traceId: row.trace_id,
        data: row.data,
        occurredAt: row.occurred_at.toISOString(),
      }));
    },

    async deleteOlderThan(days) {
      const result = await database.query(
        `DELETE FROM audit_events WHERE occurred_at < NOW() - make_interval(days => $1)`,
        [days],
      );
      return result.rowCount ?? 0;
    },
  };
}
