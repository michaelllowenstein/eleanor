import { Router } from "express";
import type { RequestHandler } from "express";
import { z } from "zod";

import { requireAuthentication } from "../../middleware/auth.js";
import { decodeProfileMetric } from "../profile/metric.js";
import type { AuditTrail } from "./service.js";
import type { ApiAuditKind } from "./types.js";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.string().regex(/^\d{1,19}$/).optional(),
  traceId: z.string().regex(/^[A-Za-z0-9._-]{8,128}$/).optional(),
});

/**
 * GET /api/audit-trail?limit=50&before=<id>&traceId=<id>
 * The signed-in user's own events, newest first. The basis for a future
 * "what Eleanor did and why" view in the client.
 */
export function createAuditRouter(audit: AuditTrail): Router {
  const router = Router();
  router.use(requireAuthentication());

  router.get("/", async (request, response) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid query.", code: "INVALID_QUERY" });
      return;
    }

    const userId = request.eleanorSession!.data.user!.id;
    const events = await audit.list(userId, {
      limit: parsed.data.limit,
      beforeId: parsed.data.before,
      traceId: parsed.data.traceId,
    });

    response.json({
      enabled: audit.enabled,
      events,
      next: events.length === parsed.data.limit ? events[events.length - 1]?.id ?? null : null,
    });
  });

  return router;
}

interface AuditedRoute {
  readonly method: string;
  readonly path: string;
  readonly kind: ApiAuditKind;
  readonly summary: string;
  readonly data?: (body: unknown) => Record<string, unknown>;
}

/**
 * Records audit events for successful security and settings changes without
 * touching those routers: it matches method + path and writes when the
 * response finishes with a 2xx. The user id is captured before the handler
 * runs because some handlers rotate or destroy the session.
 */
const AUDITED: readonly AuditedRoute[] = [
  {
    method: "PUT",
    path: "/api/provider-credentials",
    kind: "credential.saved",
    summary: "Saved a provider API key.",
    data: (body) => ({ provider: (body as { provider?: unknown })?.provider ?? null }),
  },
  {
    method: "DELETE",
    path: "/api/provider-credentials",
    kind: "credential.removed",
    summary: "Removed the provider API key.",
  },
  {
    method: "POST",
    path: "/api/passkeys/registration/verify",
    kind: "passkey.registered",
    summary: "Registered a passkey.",
  },
  {
    method: "POST",
    path: "/api/passkeys/step-up/verify",
    kind: "passkey.step_up",
    summary: "Verified with a passkey.",
  },
  {
    method: "PUT",
    path: "/api/assistant-profile",
    kind: "profile.updated",
    summary: "Changed Eleanor's settings.",
    data: (body) => {
      const metric = (body as { metric?: unknown })?.metric;
      try {
        return { metric: String(metric), settings: decodeProfileMetric(metric) };
      } catch {
        return { metric: String(metric) };
      }
    },
  },
];

export function auditMutations(audit: AuditTrail): RequestHandler {
  return (request, response, next) => {
    const path = request.path.replace(/\/$/, "");
    const route = AUDITED.find((r) => r.method === request.method && r.path === path);
    const userId = request.eleanorSession?.data.user?.id;

    if (route && userId) {
      const body: unknown = request.body;
      const traceId = request.traceId;
      response.on("finish", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) return;
        void audit.record({
          userId,
          kind: route.kind,
          source: "api",
          summary: route.summary,
          ...(traceId ? { traceId } : {}),
          data: route.data ? route.data(body) : {},
        });
      });
    }

    next();
  };
}
