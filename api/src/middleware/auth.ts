import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

import { SessionService } from "../modules/auth/session/service.js";

export function attachSession(sessions: SessionService): RequestHandler {
  return async (request, _response, next) => {
    request.eleanorSession = (await sessions.get(request)) ?? undefined;
    next();
  };
}

export function requireAuthentication(): RequestHandler {
  return (request, response, next) => {
    if (!request.eleanorSession?.data.user) {
      response.status(401).json({
        error: "Authentication required.",
        code: "AUTHENTICATION_REQUIRED",
      });
      return;
    }

    next();
  };
}

export function requireCsrf(): RequestHandler {
  return (request, response, next) => {
    const expected = request.eleanorSession?.data.csrfToken;
    const received = request.header("x-csrf-token");

    if (!expected || !received || !safeEqual(expected, received)) {
      response.status(403).json({
        error: "CSRF validation failed.",
        code: "CSRF_VALIDATION_FAILED",
      });
      return;
    }

    next();
  };
}

export function requireRecentStepUp(maxAgeSeconds: number): RequestHandler {
  return (request, response, next) => {
    const verifiedAt = request.eleanorSession?.data.stepUpVerifiedAt;

    if (!verifiedAt || Date.now() - verifiedAt > maxAgeSeconds * 1_000) {
      response.status(428).json({
        error: "Passkey verification is required.",
        code: "STEP_UP_REQUIRED",
      });
      return;
    }

    next();
  };
}

function safeEqual(leftValue: string, rightValue: string): boolean {
  const left = Buffer.from(leftValue, "utf8");
  const right = Buffer.from(rightValue, "utf8");

  return left.length === right.length && timingSafeEqual(left, right);
}
