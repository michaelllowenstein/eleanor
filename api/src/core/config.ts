export interface AppConfig {
  readonly production: boolean;
  readonly port: number;
  readonly logLevel: LogLevel;
  readonly databaseUrl: string;
  readonly redisUrl: string;
  /** Origin the browser uses (Vercel domain in prod, dev server locally). */
  readonly publicOrigin: string;
  readonly oidcIssuer: string;
  readonly oidcClientId: string;
  readonly oidcClientSecret: string;
  readonly webauthnRpId: string;
  readonly webauthnRpName: string;
  readonly credentialEncryptionKey: string;
  readonly realtimeModel: string;
  readonly sessionTtlSeconds: number;
  readonly stepUpTtlSeconds: number;
  readonly passkeyEnrollmentMaxOidcAgeSeconds: number;
  readonly realtimeSessionRateLimitPerMinute: number;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

type Env = Readonly<Record<string, string | undefined>>;

export class ConfigError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Invalid configuration:\n  - ${problems.join("\n  - ")}`);
    this.name = "ConfigError";
  }
}

/**
 * Loads and validates configuration. Every problem is collected and reported
 * at once so a misconfigured deploy fails fast with a complete list.
 */
export function loadConfig(env: Env = process.env): AppConfig {
  const problems: string[] = [];

  const required = (name: string): string => {
    const value = env[name]?.trim();
    if (!value) {
      problems.push(`${name} is required.`);
      return "";
    }
    return value;
  };

  const positiveInteger = (name: string, fallback: number): number => {
    const raw = env[name]?.trim();
    if (!raw) return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) {
      problems.push(`${name} must be a positive integer.`);
      return fallback;
    }
    return value;
  };

  const production = env.NODE_ENV === "production";
  const publicOrigin = required("PUBLIC_ORIGIN");
  const webauthnRpId = required("WEBAUTHN_RP_ID");
  const oidcIssuer = required("OIDC_ISSUER");
  const credentialEncryptionKey = required("CREDENTIAL_ENCRYPTION_KEY");

  if (publicOrigin) {
    try {
      const url = new URL(publicOrigin);
      if (url.origin !== publicOrigin.replace(/\/$/, "")) {
        problems.push("PUBLIC_ORIGIN must be a bare origin (scheme://host[:port]) with no path.");
      }
      if (production && url.protocol !== "https:") {
        problems.push("PUBLIC_ORIGIN must use https in production.");
      }
      if (
        webauthnRpId &&
        url.hostname !== webauthnRpId &&
        !url.hostname.endsWith(`.${webauthnRpId}`)
      ) {
        problems.push(
          `WEBAUTHN_RP_ID (${webauthnRpId}) must equal or be a parent domain of the PUBLIC_ORIGIN host (${url.hostname}).`,
        );
      }
    } catch {
      problems.push("PUBLIC_ORIGIN must be a valid URL.");
    }
  }

  if (oidcIssuer && production && !oidcIssuer.startsWith("https://")) {
    problems.push("OIDC_ISSUER must use https in production.");
  }

  if (
    credentialEncryptionKey &&
    Buffer.from(credentialEncryptionKey, "base64").length !== 32
  ) {
    problems.push(
      "CREDENTIAL_ENCRYPTION_KEY must be base64 that decodes to exactly 32 bytes (openssl rand -base64 32).",
    );
  }

  const logLevel = (env.LOG_LEVEL?.trim() || "info") as LogLevel;
  if (!["debug", "info", "warn", "error"].includes(logLevel)) {
    problems.push("LOG_LEVEL must be one of debug, info, warn, error.");
  }

  const config: AppConfig = {
    production,
    port: positiveInteger("PORT", 3000),
    logLevel,
    databaseUrl: required("DATABASE_URL"),
    redisUrl: required("REDIS_URL"),
    publicOrigin: publicOrigin.replace(/\/$/, ""),
    oidcIssuer,
    oidcClientId: required("OIDC_CLIENT_ID"),
    oidcClientSecret: required("OIDC_CLIENT_SECRET"),
    webauthnRpId,
    webauthnRpName: env.WEBAUTHN_RP_NAME?.trim() || "Eleanor",
    credentialEncryptionKey,
    realtimeModel: env.REALTIME_MODEL?.trim() || "gpt-realtime-2.1",
    sessionTtlSeconds: positiveInteger("SESSION_TTL_SECONDS", 28_800),
    stepUpTtlSeconds: positiveInteger("STEP_UP_TTL_SECONDS", 300),
    passkeyEnrollmentMaxOidcAgeSeconds: positiveInteger(
      "PASSKEY_ENROLLMENT_MAX_OIDC_AGE_SECONDS",
      600,
    ),
    realtimeSessionRateLimitPerMinute: positiveInteger(
      "REALTIME_SESSION_RATE_LIMIT_PER_MINUTE",
      20,
    ),
  };

  if (problems.length > 0) {
    throw new ConfigError(problems);
  }

  return config;
}
