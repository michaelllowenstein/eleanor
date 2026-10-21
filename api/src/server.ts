import "dotenv/config";

import { createApp } from "./app.js";
import { loadConfig } from "./core/config.js";
import { createDatabase } from "./core/database.js";
import { createLogger } from "./core/logger.js";
import { createRedis } from "./core/redis.js";
import { createRedisRateLimitMiddleware } from "./middleware/rate-limit.js";
import { OidcService } from "./modules/auth/oidc/service.js";
import { SessionService } from "./modules/auth/session/service.js";
import { CredentialCryptoService } from "./modules/credentials/crypto/service.js";
import { createCredentialRepository } from "./modules/credentials/repository.js";
import { CredentialService } from "./modules/credentials/service.js";
import { createPasskeyRepository } from "./modules/passkey/repository.js";
import { PasskeyService } from "./modules/passkey/service.js";
import { createAssistantProfileRepository } from "./modules/profile/repository.js";
import { createOpenAIRealtimeProviderFactory } from "./modules/realtime/provider.js";
import { createUserRepository } from "./modules/users/repository.js";

const config = loadConfig();
const logger = createLogger(config.logLevel);

const database = createDatabase(config.databaseUrl);
const redis = await createRedis(config.redisUrl);

const sessions = new SessionService(redis, {
  production: config.production,
  ttlSeconds: config.sessionTtlSeconds,
});

const oidc = await discoverWithRetry();

const app = createApp({
  logger,
  publicOrigin: config.publicOrigin,
  stepUpTtlSeconds: config.stepUpTtlSeconds,
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
  realtimeRateLimit: createRedisRateLimitMiddleware(
    redis,
    config.realtimeSessionRateLimitPerMinute,
  ),
  realtimeProviderFactory: createOpenAIRealtimeProviderFactory(config.realtimeModel),
  readinessChecks: {
    database: () => database.query("SELECT 1"),
    redis: () => redis.ping(),
  },
});

const server = app.listen(config.port, () => {
  logger.info("server.listening", { port: config.port, production: config.production });
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("server.shutdown", { signal });

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

/**
 * The API is useless without the identity provider, but a transient IdP blip
 * during deploy should not crash-loop the container.
 */
async function discoverWithRetry(): Promise<OidcService> {
  const attempts = 6;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await OidcService.create({
        issuer: config.oidcIssuer,
        clientId: config.oidcClientId,
        clientSecret: config.oidcClientSecret,
        // Same-origin deployment: Vercel rewrites /api/* to this service, so
        // the browser-facing origin serves both the app and the callback.
        publicApiOrigin: config.publicOrigin,
        publicAppOrigin: config.publicOrigin,
      });
    } catch (error) {
      if (attempt >= attempts) throw error;
      const delay = Math.min(1_000 * 2 ** (attempt - 1), 15_000);
      logger.warn("oidc.discovery_retry", { attempt, delayMs: delay, error });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
