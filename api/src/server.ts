import "dotenv/config";

import { createApp } from "./app.js";
import { ConfigError, loadConfig } from "./core/config.js";
import { createDatabase } from "./core/database.js";
import { createLogger } from "./core/logger.js";
import { createRedis } from "./core/redis.js";
import { createRedisRateLimitMiddleware } from "./middleware/rate-limit.js";
import { createAuditRepository } from "./modules/audit/repository.js";
import { AuditTrail } from "./modules/audit/service.js";
import { OidcService } from "./modules/auth/oidc/service.js";
import { SessionService } from "./modules/auth/session/service.js";
import { CredentialCryptoService } from "./modules/credentials/crypto/service.js";
import { createCredentialRepository } from "./modules/credentials/repository.js";
import { CredentialService } from "./modules/credentials/service.js";
import { createPasskeyRepository } from "./modules/passkey/repository.js";
import { PasskeyService } from "./modules/passkey/service.js";
import { createAssistantProfileRepository } from "./modules/profile/repository.js";
import {
  createMockRealtimeProviderFactory,
  createOpenAIRealtimeProviderFactory,
} from "./modules/realtime/provider.js";
import { createUserRepository } from "./modules/users/repository.js";

const config = (() => {
  try {
    return loadConfig();
  } catch (error) {
    // Before a logger exists: print the full list once and exit non-zero so
    // the platform marks the deploy as failed.
    console.error(error instanceof ConfigError ? error.message : error);
    process.exit(1);
  }
})();

const logger = createLogger({
  level: config.logLevel,
  trace: config.logTrace,
  format: config.logFormat,
  service: "eleanor-api",
});
const boot = logger.child({ category: "boot" });

for (const warning of config.warnings) boot.warn("config.warning", { warning });

boot.info("config.loaded", {
  production: config.production,
  realtimeProvider: config.realtimeProvider,
  realtimeModel: config.realtimeModel,
  logLevel: config.logLevel,
  logTrace: config.logTrace,
  clientLogIngest: config.clientLogIngest,
  auditTrailEnabled: config.auditTrailEnabled,
  originGuard: config.originSecrets.length > 0,
  allowlist: config.allowedEmails.length,
});

const database = createDatabase(config.databaseUrl);
database.on("error", (error) => boot.error("postgres.pool_error", { error }));

const redis = await createRedis(config.redisUrl);

const sessions = new SessionService(redis, {
  production: config.production,
  ttlSeconds: config.sessionTtlSeconds,
});

const oidc = await discoverWithRetry();

const audit = new AuditTrail(createAuditRepository(database), logger, {
  enabled: config.auditTrailEnabled,
  retentionDays: config.auditRetentionDays,
});

const app = createApp({
  logger,
  publicOrigin: config.publicOrigin,
  stepUpTtlSeconds: config.stepUpTtlSeconds,
  trustProxyHops: config.trustProxyHops,
  originSecrets: config.originSecrets,
  allowedEmails: config.allowedEmails,
  sessions,
  oidc,
  users: createUserRepository(database),
  profiles: createAssistantProfileRepository(database),
  credentials: new CredentialService(
    createCredentialRepository(database),
    new CredentialCryptoService(config.credentialEncryptionKey),
  ),
  passkeys: new PasskeyService(createPasskeyRepository(database), sessions, {
    rpId: config.webauthnRpId,
    rpName: config.webauthnRpName,
    expectedOrigin: config.publicOrigin,
    enrollmentMaxOidcAgeSeconds: config.passkeyEnrollmentMaxOidcAgeSeconds,
    stepUpTtlSeconds: config.stepUpTtlSeconds,
  }),
  audit,
  realtimeRateLimit: createRedisRateLimitMiddleware(
    redis,
    config.realtimeSessionRateLimitPerMinute,
    { keyPrefix: "realtime", logger },
  ),
  realtimeProviderFactory:
    config.realtimeProvider === "mock"
      ? createMockRealtimeProviderFactory(logger)
      : createOpenAIRealtimeProviderFactory(config.realtimeModel, logger),
  telemetry: {
    enabled: config.clientLogIngest,
    rateLimit: createRedisRateLimitMiddleware(redis, config.telemetryRateLimitPerMinute, {
      keyPrefix: "telemetry",
      logger,
      message: "Too many telemetry batches.",
    }),
  },
  readinessChecks: {
    database: () => database.query("SELECT 1"),
    redis: () => redis.ping(),
  },
});

const server = app.listen(config.port, () => {
  boot.info("server.listening", { port: config.port, production: config.production });
});

// Prune the audit trail at startup and then daily.
void audit.prune();
const pruneTimer = setInterval(() => void audit.prune(), 24 * 60 * 60 * 1000);
pruneTimer.unref();

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  boot.info("server.shutdown", { signal });

  // Stop accepting connections and let in-flight requests finish (max 10s).
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 10_000);
    server.close(() => {
      clearTimeout(timer);
      resolve();
    });
  });

  await Promise.allSettled([database.end(), redis.quit()]);
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => boot.error("process.unhandled_rejection", { error: reason }));

/**
 * The API is useless without the identity provider, but a transient IdP blip
 * during deploy should not crash-loop the container.
 */
async function discoverWithRetry(): Promise<OidcService> {
  const attempts = 6;
  for (let attempt = 1; ; attempt += 1) {
    try {
      const service = await OidcService.create({
        issuer: config.oidcIssuer,
        clientId: config.oidcClientId,
        clientSecret: config.oidcClientSecret,
        // Same-origin deployment: Vercel rewrites /api/* to this service, so
        // the browser-facing origin serves both the app and the callback.
        publicApiOrigin: config.publicOrigin,
        publicAppOrigin: config.publicOrigin,
        reauthPrompt: config.oidcReauthPrompt,
      });
      boot.info("oidc.discovered", { issuer: config.oidcIssuer });
      return service;
    } catch (error) {
      if (attempt >= attempts) {
        boot.error("oidc.discovery_failed", { issuer: config.oidcIssuer, attempts, error });
        throw error;
      }
      const delay = Math.min(1_000 * 2 ** (attempt - 1), 15_000);
      boot.warn("oidc.discovery_retry", {
        issuer: config.oidcIssuer,
        attempt,
        delayMs: delay,
        error,
      });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
