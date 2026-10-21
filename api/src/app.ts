import express from "express";
import type { RequestHandler } from "express";
import helmet from "helmet";

import type { Logger } from "./core/logger.js";
import { attachSession } from "./middleware/auth.js";
import { requestId } from "./middleware/request-id.js";
import type { OidcClient } from "./modules/auth/oidc/service.js";
import { createAuthRouter } from "./modules/auth/routes.js";
import type { SessionService } from "./modules/auth/session/service.js";
import { createCredentialRouter } from "./modules/credentials/routes.js";
import type { CredentialService } from "./modules/credentials/service.js";
import { createPasskeyRouter } from "./modules/passkey/routes.js";
import type { PasskeyService } from "./modules/passkey/service.js";
import type { AssistantProfileRepository } from "./modules/profile/repository.js";
import { createProfileRouter } from "./modules/profile/routes.js";
import type { RealtimeProviderFactory } from "./modules/realtime/provider.js";
import { createRealtimeRouter } from "./modules/realtime/routes.js";
import type { UserRepository } from "./modules/users/repository.js";

export interface AppDependencies {
  readonly logger: Logger;
  readonly publicOrigin: string;
  readonly stepUpTtlSeconds: number;
  readonly sessions: SessionService;
  readonly oidc: OidcClient;
  readonly users: UserRepository;
  readonly profiles: AssistantProfileRepository;
  readonly credentials: CredentialService;
  readonly passkeys: PasskeyService;
  readonly realtimeRateLimit: RequestHandler;
  readonly realtimeProviderFactory: RealtimeProviderFactory;
  /** Dependency probes for /api/health/ready. Each rejects when unhealthy. */
  readonly readinessChecks: Readonly<Record<string, () => Promise<unknown>>>;
}

/**
 * Builds the Express application from already-constructed dependencies.
 * Kept free of I/O so it can be exercised in tests with in-memory fakes.
 */
export function createApp(deps: AppDependencies): express.Express {
  const app = express();

  app.disable("x-powered-by");
  // Exactly one proxy hop (Vercel rewrite -> Railway edge). Adjust if the
  // topology changes; see docs/RUNBOOK.md "Proxies and client IPs".
  app.set("trust proxy", 1);

  app.use(requestId());
  app.use(helmet({ crossOriginEmbedderPolicy: false }));
  app.use(express.json({ limit: "64kb" }));
  app.use(express.text({ type: ["application/sdp"], limit: "128kb" }));
  app.use(attachSession(deps.sessions));

  app.get("/api/health/live", (_request, response) => {
    response.set("Cache-Control", "no-store").json({ status: "ok" });
  });

  const ready: express.RequestHandler = async (_request, response) => {
    const results = await Promise.all(
      Object.entries(deps.readinessChecks).map(async ([name, check]) => {
        try {
          await check();
          return [name, "ok"] as const;
        } catch {
          return [name, "unavailable"] as const;
        }
      }),
    );

    const healthy = results.every(([, state]) => state === "ok");
    response
      .status(healthy ? 200 : 503)
      .set("Cache-Control", "no-store")
      .json({ status: healthy ? "ok" : "degraded", ...Object.fromEntries(results) });
  };

  app.get("/api/health/ready", ready);
  // Backwards-compatible alias used by the v0.7 Railway health check.
  app.get("/api/health", ready);

  app.use(
    "/api/auth",
    createAuthRouter({
      sessions: deps.sessions,
      oidc: deps.oidc,
      users: deps.users,
      publicOrigin: deps.publicOrigin,
      logger: deps.logger,
    }),
  );
  app.use("/api/passkeys", createPasskeyRouter(deps.passkeys));
  app.use(
    "/api/provider-credentials",
    createCredentialRouter(deps.credentials, deps.stepUpTtlSeconds),
  );
  app.use("/api/assistant-profile", createProfileRouter(deps.profiles));
  app.use(
    "/api/realtime",
    createRealtimeRouter({
      profiles: deps.profiles,
      credentials: deps.credentials,
      rateLimit: deps.realtimeRateLimit,
      providerFactory: deps.realtimeProviderFactory,
      logger: deps.logger,
    }),
  );

  app.use((_request, response) => {
    response.status(404).json({ error: "Route not found.", code: "NOT_FOUND" });
  });

  app.use(
    (
      error: unknown,
      request: express.Request,
      response: express.Response,
      _next: express.NextFunction,
    ) => {
      // Body-parser errors carry an HTTP status (400 malformed, 413 too large).
      const status =
        typeof error === "object" &&
        error !== null &&
        "status" in error &&
        typeof error.status === "number" &&
        error.status >= 400 &&
        error.status < 500
          ? error.status
          : 500;

      if (status >= 500) {
        deps.logger.error("http.unhandled", { requestId: request.requestId, error });
      }

      response.status(status).json({
        error: status === 500 ? "Internal server error." : "Invalid request.",
        code: status === 500 ? "INTERNAL_ERROR" : "INVALID_REQUEST",
        requestId: request.requestId,
      });
    },
  );

  return app;
}
