import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

import type { Logger } from "../core/logger.js";

/**
 * Rejects requests that did not come through the Vercel proxy.
 *
 * Vercel's route transform sets `x-origin-secret` on every request it
 * rewrites to this API (see vercel.json). Requests straight to the Railway
 * domain lack it and get 403. Health checks are exempt because Railway calls
 * them directly during deploys.
 *
 * With no secrets configured (local dev) this middleware does nothing.
 */
export function originGuard(secrets: readonly string[], logger: Logger): RequestHandler {
  const expected = secrets.map((secret) => Buffer.from(secret, "utf8"));
  const log = logger.child({ category: "http" });

  return (request, response, next) => {
    if (expected.length === 0 || request.path.startsWith("/api/health")) {
      next();
      return;
    }

    const received = Buffer.from(request.header("x-origin-secret") ?? "", "utf8");
    const ok = expected.some(
      (value) => value.length === received.length && timingSafeEqual(value, received),
    );

    if (!ok) {
      log.warn("http.origin_rejected", {
        method: request.method,
        path: request.path,
        hadHeader: received.length > 0,
      });
      response.status(403).json({ error: "Forbidden.", code: "ORIGIN_FORBIDDEN" });
      return;
    }

    next();
  };
}
