import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

const VALID = /^[A-Za-z0-9._-]{8,128}$/;

/** Propagates X-Request-Id (or creates one) for log correlation. */
export function requestId(): RequestHandler {
  return (request, response, next) => {
    const incoming = request.header("x-request-id");
    const id = incoming && VALID.test(incoming) ? incoming : randomUUID();
    request.requestId = id;
    response.setHeader("X-Request-Id", id);
    next();
  };
}
