/** Events the API records on its own. */
export const API_AUDIT_KINDS = [
  "auth.login",
  "auth.logout",
  "passkey.registered",
  "passkey.step_up",
  "credential.saved",
  "credential.removed",
  "profile.updated",
  "realtime.session_started",
  "realtime.session_failed",
] as const;

/**
 * Events the browser may report through POST /api/telemetry/client.
 * Anything else a client sends as audit is ignored.
 */
export const CLIENT_AUDIT_KINDS = [
  "realtime.settings_applied",
  "realtime.turn",
  "realtime.response",
  "realtime.error",
  "realtime.session_ended",
] as const;

export type ApiAuditKind = (typeof API_AUDIT_KINDS)[number];
export type ClientAuditKind = (typeof CLIENT_AUDIT_KINDS)[number];
export type AuditKind = ApiAuditKind | ClientAuditKind;

export interface AuditEventInput {
  readonly userId: string;
  readonly kind: AuditKind;
  readonly source: "api" | "client";
  /** One human-readable sentence, shown as-is in a future audit view. */
  readonly summary: string;
  readonly traceId?: string;
  readonly data?: Record<string, unknown>;
  /** Defaults to now. Client events pass their own timestamp. */
  readonly occurredAt?: Date;
}

export interface AuditEvent {
  readonly id: string;
  readonly kind: AuditKind;
  readonly source: "api" | "client";
  readonly summary: string;
  readonly traceId: string | null;
  readonly data: Record<string, unknown>;
  readonly occurredAt: string;
}
