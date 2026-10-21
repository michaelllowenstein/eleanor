import { Router } from "express";
import { z } from "zod";

import {
  requireAuthentication,
  requireCsrf,
  requireRecentStepUp,
} from "../../middleware/auth.js";
import { CredentialService } from "./service.js";

const payloadSchema = z.object({
  provider: z.literal("openai"),
  apiKey: z.string().trim().min(20).max(512),
});

export function createCredentialRouter(
  credentials: CredentialService,
  stepUpTtlSeconds: number,
): Router {
  const router = Router();

  router.use(requireAuthentication());

  router.get("/status", async (request, response) => {
    const userId = request.eleanorSession!.data.user!.id;

    response
      .set("Cache-Control", "no-store")
      .json(await credentials.status(userId));
  });

  router.get(
    "/details",
    requireRecentStepUp(stepUpTtlSeconds),
    async (request, response) => {
      const userId = request.eleanorSession!.data.user!.id;

      response
        .set("Cache-Control", "no-store")
        .json({
          credential: await credentials.details(userId),
        });
    },
  );

  router.put(
    "/",
    requireCsrf(),
    requireRecentStepUp(stepUpTtlSeconds),
    async (request, response) => {
      const parsed = payloadSchema.safeParse(request.body);

      if (!parsed.success) {
        response.status(400).json({
          error: "Invalid provider credential.",
          code: "INVALID_PROVIDER_CREDENTIAL",
        });
        return;
      }

      const userId = request.eleanorSession!.data.user!.id;

      await credentials.save(
        userId,
        parsed.data.provider,
        parsed.data.apiKey,
      );

      response.status(204).send();
    },
  );

  router.delete(
    "/",
    requireCsrf(),
    requireRecentStepUp(stepUpTtlSeconds),
    async (request, response) => {
      const userId = request.eleanorSession!.data.user!.id;
      await credentials.remove(userId);
      response.status(204).send();
    },
  );

  return router;
}
