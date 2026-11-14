import { Router } from "express";
import type { RequestHandler } from "express";
import { z } from "zod";

import type { Logger } from "../../core/logger.js";
import { requireAuthentication, requireCsrf } from "../../middleware/auth.js";
import type { AuditTrail } from "../audit/service.js";
import { CLIENT_AUDIT_KINDS } from "../audit/types.js";

const ID = /^[A-Za-z0-9._-]{8,128}$/;

const eventSchema = z.object({
  /** Client clock, epoch ms. */
  t: z.number(),
  level: z.enum(["debug", "info", "warn", "error"]),
  category: z.string().min(1).max(40).regex(/^[a-z0-9_.-]+$/),
  message: z.string().min(1).max(120),
  traceId: z.string().regex(ID).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  audit: z
    .object({
      kind: z.enum(CLIENT_AUDIT_KINDS),
      summary: z.string().min(1).max(240),
    })
    .optional(),
});

const batchSchema = z.object({
  /** One id per page load, to tell browser tabs apart. */
  clientId: z.string().regex(ID),
  appVersion: z.string().max(40).optional(),
  events: z.array(eventSchema).min(1).max(100),
});

/**
 * POST /api/telemetry/client — batched logs from the browser.
 *
 * Each event is re-emitted through the API logger under category
 * "client.<category>", so LOG_TRACE=client=debug (or client.webrtc=debug)
 * controls what reaches the platform logs. Events carrying `audit` are also
 * written to the user's audit trail (only the CLIENT_AUDIT_KINDS).
 */
export function createTelemetryRouter(deps: {
  readonly logger: Logger;
  readonly audit: AuditTrail;
  readonly enabled: boolean;
  readonly rateLimit: RequestHandler;
}): Router {
  const router = Router();
  const base = deps.logger.child({ category: "client" });

  router.post(
    "/client",
    requireAuthentication(),
    requireCsrf(),
    deps.rateLimit,
    async (request, response) => {
      if (!deps.enabled) {
        response.status(204).send();
        return;
      }

      const parsed = batchSchema.safeParse(request.body);
      if (!parsed.success) {
        base.debug("client.batch_rejected", { issues: parsed.error.issues.length });
        response.status(400).json({ error: "Invalid telemetry batch.", code: "INVALID_TELEMETRY" });
        return;
      }

      const userId = request.eleanorSession!.data.user!.id;
      const { clientId, appVersion, events } = parsed.data;
      const now = Date.now();

      for (const event of events) {
        const log = base.child({ category: `client.${event.category}` });
        log[event.level](event.message, {
          clientId,
          ...(appVersion ? { appVersion } : {}),
          ...(event.traceId ? { traceId: event.traceId } : {}),
          clientTime: new Date(event.t).toISOString(),
          clockSkewMs: Math.round(now - event.t),
          ...(event.data ? { data: event.data } : {}),
        });

        if (event.audit) {
          // Clamp client clocks to a sane window so the trail stays ordered.
          const occurredAt =
            Math.abs(now - event.t) < 24 * 60 * 60 * 1000 ? new Date(event.t) : new Date(now);
          await deps.audit.record({
            userId,
            kind: event.audit.kind,
            source: "client",
            summary: event.audit.summary,
            ...(event.traceId ? { traceId: event.traceId } : {}),
            data: event.data ?? {},
            occurredAt,
          });
        }
      }

      response.status(204).send();
    },
  );

  return router;
}
