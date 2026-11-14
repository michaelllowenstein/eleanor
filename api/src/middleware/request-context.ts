import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

import { ID_PATTERN, currentContext, runWithContext, userRef } from "../core/context.js";
import type { Logger } from "../core/logger.js";

/**
 * Step 1 (first middleware): assign X-Request-Id and read X-Eleanor-Trace-Id.
 * Runs before the body parsers so even a 400/413 from them carries an id.
 */
export function assignRequestIds(): RequestHandler {
  return (request, response, next) => {
    const incoming = request.header("x-request-id");
    request.requestId = incoming && ID_PATTERN.test(incoming) ? incoming : randomUUID();

    const trace = request.header("x-eleanor-trace-id");
    if (trace && ID_PATTERN.test(trace)) request.traceId = trace;

    response.setHeader("X-Request-Id", request.requestId);
    next();
  };
}

/**
 * Step 2 (after the body parsers): bind the ids to AsyncLocalStorage so every
 * log line written while handling this request carries them. It must come
 * after body parsing because stream callbacks lose the async context.
 */
export function bindRequestContext(): RequestHandler {
  return (request, _response, next) => {
    runWithContext(
      { requestId: request.requestId, ...(request.traceId ? { traceId: request.traceId } : {}) },
      next,
    );
  };
}

/** Step 3 (after attachSession): add the hashed user reference. */
export function bindUserToContext(): RequestHandler {
  return (request, _response, next) => {
    const id = request.eleanorSession?.data.user?.id;
    const context = currentContext();
    if (id && context) context.userRef = userRef(id);
    next();
  };
}

/**
 * One access-log line per request, written when the response finishes.
 * The query string is never logged (the OIDC callback carries the
 * authorization code in it).
 */
export function accessLog(logger: Logger): RequestHandler {
  const http = logger.child({ category: "http" });

  return (request, response, next) => {
    const started = performance.now();
    const path = request.originalUrl.split("?")[0] ?? request.originalUrl;
    const quiet = path.startsWith("/api/health");

    response.on("finish", () => {
      const status = response.statusCode;
      const fields = {
        method: request.method,
        path,
        status,
        durationMs: Math.round(performance.now() - started),
        requestId: request.requestId,
        ...(request.traceId ? { traceId: request.traceId } : {}),
        ...(request.eleanorSession?.data.user?.id
          ? { userRef: userRef(request.eleanorSession.data.user.id) }
          : {}),
      };
      if (status >= 500) http.error("http.request", fields);
      else if (status >= 400) http.warn("http.request", fields);
      else if (quiet) http.debug("http.request", fields);
      else http.info("http.request", fields);
    });

    next();
  };
}

/**
 * Every /api response defaults to no-store, for browsers and for Vercel's CDN.
 * Vercel caches external-rewrite responses that carry cache headers by
 * default for projects created on or after 2026-04-06, and none of this API
 * is cacheable. A route may still override Cache-Control explicitly.
 */
export function noStore(): RequestHandler {
  return (_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("CDN-Cache-Control", "no-store");
    response.setHeader("Vercel-CDN-Cache-Control", "no-store");
    next();
  };
}
