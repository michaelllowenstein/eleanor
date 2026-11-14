import { createHash } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-request correlation data. Every log line written while a request is
 * being handled picks these fields up automatically (see logger.ts).
 *
 * - requestId: one HTTP request (X-Request-Id).
 * - traceId:   one client-side flow, e.g. a whole voice session. The browser
 *              sends it as X-Eleanor-Trace-Id so API and client logs join up.
 * - userRef:   a short, non-reversible hash of the OIDC subject. Never log the
 *              raw subject or the email address.
 */
export interface RequestContext {
  readonly requestId: string;
  readonly traceId?: string;
  userRef?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function currentContext(): RequestContext | undefined {
  return storage.getStore();
}

export function userRef(userId: string): string {
  return createHash("sha256").update(userId, "utf8").digest("hex").slice(0, 12);
}

/** Header values we accept as ids: short, URL-safe, no whitespace. */
export const ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/;
