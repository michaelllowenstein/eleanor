import { Router } from "express";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";

import {
  requireAuthentication,
  requireCsrf,
} from "../../middleware/auth.js";
import {
  PasskeyPolicyError,
  PasskeyService,
} from "./service.js";

export function createPasskeyRouter(
  passkeys: PasskeyService,
): Router {
  const router = Router();

  router.use(requireAuthentication());

  router.get("/status", async (request, response) => {
    try {
      response
        .set("Cache-Control", "no-store")
        .json(
          await passkeys.status(request.eleanorSession!),
        );
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post(
    "/registration/options",
    requireCsrf(),
    async (request, response) => {
      try {
        response.json(
          await passkeys.registrationOptions(
            request.eleanorSession!,
          ),
        );
      } catch (error) {
        sendError(response, error);
      }
    },
  );

  router.post(
    "/registration/verify",
    requireCsrf(),
    async (request, response) => {
      try {
        response.json(
          await passkeys.verifyRegistration(
            request.eleanorSession!,
            request.body as RegistrationResponseJSON,
          ),
        );
      } catch (error) {
        sendError(response, error);
      }
    },
  );

  router.post(
    "/step-up/options",
    requireCsrf(),
    async (request, response) => {
      try {
        response.json(
          await passkeys.authenticationOptions(
            request.eleanorSession!,
          ),
        );
      } catch (error) {
        sendError(response, error);
      }
    },
  );

  router.post(
    "/step-up/verify",
    requireCsrf(),
    async (request, response) => {
      try {
        response.json(
          await passkeys.verifyAuthentication(
            request.eleanorSession!,
            request.body as AuthenticationResponseJSON,
          ),
        );
      } catch (error) {
        sendError(response, error);
      }
    },
  );

  return router;
}

function sendError(
  response: import("express").Response,
  error: unknown,
): void {
  if (error instanceof PasskeyPolicyError) {
    response.status(error.status).json({
      error: error.message,
      code: error.code,
    });
    return;
  }

  console.error("Passkey operation failed:", error);

  response.status(500).json({
    error: "Passkey operation failed.",
    code: "PASSKEY_INTERNAL_ERROR",
  });
}
