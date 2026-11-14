import express from "express";
import type { RequestHandler } from "express";
import helmet from "helmet";

import type { Logger } from "./core/logger.js";
import { attachSession } from "./middleware/auth.js";
import { originGuard } from "./middleware/origin-guard.js";
import {
  accessLog,
  assignRequestIds,
  bindRequestContext,
  bindUserToContext,
  noStore,
} from "./middleware/request-context.js";
import { auditMutations, createAuditRouter } from "./modules/audit/routes.js";
import type { AuditTrail } from "./modules/audit/service.js";
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
import { createTelemetryRouter } from "./modules/telemetry/routes.js";
import type { UserRepository } from "./modules/users/repository.js";

export interface AppDependencies {
  readonly logger: Logger;
  readonly publicOrigin: string;
  readonly stepUpTtlSeconds: number;
  readonly trustProxyHops: number;
  readonly originSecrets: readonly string[];
  readonly allowedEmails: readonly string[];
  readonly sessions: SessionService;
  readonly oidc: OidcClient;
  readonly users: UserRepository;
  readonly profiles: AssistantProfileRepository;
  readonly credentials: CredentialService;
  readonly passkeys: PasskeyService;
  readonly audit: AuditTrail;
  readonly realtimeRateLimit: RequestHandler;
  readonly realtimeProviderFactory: RealtimeProviderFactory;
  readonly telemetry: {
    readonly enabled: boolean;
    readonly rateLimit: RequestHandler;
  };
  /** Dependency probes for /api/health/ready. Each rejects when unhealthy. */
  readonly readinessChecks: Readonly<Record<string, () => Promise<unknown>>>;
}

/**
 * Builds the Express application from already-constructed dependencies.
 * Kept free of I/O so it can be exercised in tests with in-memory fakes.
 *
 * Middleware order matters:
 *   ids → access log → origin guard → no-store → helmet → body parsers
 *   → async context → session → user context → audit hooks → routes
 */
export function createApp(deps: AppDependencies): express.Express {
  const app = express();
  const log = deps.logger;

  app.disable("x-powered-by");
  // Proxy hops in front of this process (Vercel rewrite -> Railway edge).
  // Only affects request.ip; see TRUST_PROXY_HOPS in docs/OBSERVABILITY.md.
  app.set("trust proxy", deps.trustProxyHops);

  app.use(assignRequestIds());
  app.use(accessLog(log));
  app.use(originGuard(deps.originSecrets, log));
  app.use("/api", noStore());
  app.use(helmet({ crossOriginEmbedderPolicy: false }));
  app.use(express.json({ limit: "64kb" }));
  app.use(express.text({ type: ["application/sdp"], limit: "128kb" }));
  app.use(bindRequestContext());
  app.use(attachSession(deps.sessions));
  app.use(bindUserToContext());
  app.use(auditMutations(deps.audit));

  app.get("/api/health/live", (_request, response) => {
    response.json({ status: "ok" });
  });

  const ready: express.RequestHandler = async (_request, response) => {
    const results = await Promise.all(
      Object.entries(deps.readinessChecks).map(async ([name, check]) => {
        try {
          await check();
          return [name, "ok"] as const;
        } catch (error) {
          log.child({ category: "health" }).warn("health.dependency_down", { dependency: name, error });
          return [name, "unavailable"] as const;
        }
      }),
    );

    const healthy = results.every(([, state]) => state === "ok");
    response
      .status(healthy ? 200 : 503)
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
      logger: log,
      audit: deps.audit,
      allowedEmails: deps.allowedEmails,
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
      logger: log,
    }),
  );
  app.use(
    "/api/telemetry",
    createTelemetryRouter({
      logger: log,
      audit: deps.audit,
      enabled: deps.telemetry.enabled,
      rateLimit: deps.telemetry.rateLimit,
    }),
  );
  app.use("/api/audit-trail", createAuditRouter(deps.audit));

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
        log.error("http.unhandled", { requestId: request.requestId, error });
      } else {
        log.child({ category: "http" }).debug("http.client_error", {
          status,
          error,
        });
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
