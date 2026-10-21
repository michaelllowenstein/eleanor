import { Router } from "express";
import type { RequestHandler } from "express";

import type { Logger } from "../../core/logger.js";
import { requireAuthentication, requireCsrf } from "../../middleware/auth.js";
import type { CredentialService } from "../credentials/service.js";
import { DEFAULT_PROFILE_METRIC, decodeProfileMetric } from "../profile/metric.js";
import type { DecodedAssistantProfile } from "../profile/metric.js";
import type { AssistantProfileRepository } from "../profile/repository.js";
import { RealtimeProviderError } from "./provider.js";
import type { RealtimeProviderFactory } from "./provider.js";

const MAX_SDP_BYTES = 128 * 1024;

export function createRealtimeRouter(deps: {
  readonly profiles: AssistantProfileRepository;
  readonly credentials: CredentialService;
  readonly rateLimit: RequestHandler;
  readonly providerFactory: RealtimeProviderFactory;
  readonly logger: Logger;
}): Router {
  const { profiles, credentials, rateLimit, providerFactory, logger } = deps;
  const router = Router();

  router.post(
    "/session",
    requireAuthentication(),
    requireCsrf(),
    rateLimit,
    async (request, response) => {
      if (
        typeof request.body !== "string" ||
        !request.body.trim().startsWith("v=0") ||
        Buffer.byteLength(request.body) > MAX_SDP_BYTES
      ) {
        response.status(400).json({
          error: "A valid SDP offer is required.",
          code: "INVALID_SDP_OFFER",
        });
        return;
      }

      const userId = request.eleanorSession!.data.user!.id;

      // Validate the requested profile before touching credentials or the
      // provider; a malformed header is a client error, not a 502.
      let profile: DecodedAssistantProfile;
      try {
        const requestedMetric = request.header("x-eleanor-profile-metric");
        const stored = requestedMetric ? null : await profiles.find(userId);
        profile = decodeProfileMetric(
          requestedMetric ?? stored?.metric ?? DEFAULT_PROFILE_METRIC,
        );
      } catch {
        response.status(400).json({
          error: "Invalid assistant profile metric.",
          code: "INVALID_PROFILE_METRIC",
        });
        return;
      }

      const credential = await credentials.getProviderSecret(userId);

      if (!credential) {
        response.status(409).json({
          error: "Configure an API provider before activating Eleanor.",
          code: "PROVIDER_CREDENTIAL_REQUIRED",
        });
        return;
      }

      const started = performance.now();

      try {
        const answer = await providerFactory(credential.apiKey).createCall({
          sdp: request.body,
          userId,
          profile,
        });

        logger.info("realtime.session_created", {
          requestId: request.requestId,
          durationMs: Math.round(performance.now() - started),
        });

        response
          .set("Cache-Control", "no-store")
          .type("application/sdp")
          .send(answer);
      } catch (error) {
        const code =
          error instanceof RealtimeProviderError
            ? error.code
            : "REALTIME_BOOTSTRAP_FAILED";

        logger.warn("realtime.session_failed", {
          requestId: request.requestId,
          code,
          upstreamStatus:
            error instanceof RealtimeProviderError ? error.upstreamStatus : undefined,
          durationMs: Math.round(performance.now() - started),
        });

        response.status(502).json({
          error:
            code === "PROVIDER_AUTH_FAILED"
              ? "The stored provider API key was rejected. Replace it in Security settings."
              : code === "PROVIDER_RATE_LIMITED"
                ? "The provider is rate limiting this API key. Try again shortly."
                : "Unable to establish the realtime session.",
          code,
        });
      }
    },
  );

  return router;
}
