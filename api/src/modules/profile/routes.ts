import { Router } from "express";

import {
  requireAuthentication,
  requireCsrf,
} from "../../middleware/auth.js";
import { validateProfileMetric } from "./metric.js";
import type { AssistantProfileRepository } from "./repository.js";

export function createProfileRouter(
  repository: AssistantProfileRepository,
): Router {
  const router = Router();

  router.use(requireAuthentication());

  router.get("/", async (request, response) => {
    const userId = request.eleanorSession!.data.user!.id;
    response.json({
      profile: await repository.find(userId),
    });
  });

  router.put(
    "/",
    requireCsrf(),
    async (request, response) => {
      try {
        const metric = validateProfileMetric(
          request.body?.metric,
        );
        const userId =
          request.eleanorSession!.data.user!.id;

        response.json({
          profile: await repository.upsert(
            userId,
            metric.value,
            metric.version,
          ),
        });
      } catch (error) {
        response.status(400).json({
          error:
            error instanceof Error
              ? error.message
              : "Invalid profile.",
        });
      }
    },
  );

  return router;
}
