import { parseTraceSpec } from "./logger.js";

export interface AppConfig {
  readonly production: boolean;
  readonly port: number;

  // ── Logging & tracing ──────────────────────────────────────────────────
  readonly logLevel: LogLevel;
  /** Per-category level overrides parsed from LOG_TRACE. */
  readonly logTrace: Readonly<Record<string, LogLevel>>;
  readonly logFormat: "json" | "pretty";
  /** Accept batched client logs on POST /api/telemetry/client. */
  readonly clientLogIngest: boolean;
  readonly telemetryRateLimitPerMinute: number;

  // ── Audit trail ────────────────────────────────────────────────────────
  readonly auditTrailEnabled: boolean;
  readonly auditRetentionDays: number;

  // ── Infrastructure ─────────────────────────────────────────────────────
  readonly databaseUrl: string;
  readonly redisUrl: string;
  /** Origin the browser uses (Vercel domain in prod, dev server locally). */
  readonly publicOrigin: string;
  /**
   * Accepted values of the x-origin-secret header Vercel adds to proxied
   * requests. Empty = no check (local dev). Several values = rotation window.
   */
  readonly originSecrets: readonly string[];
  readonly trustProxyHops: number;

  // ── Identity ───────────────────────────────────────────────────────────
  readonly oidcIssuer: string;
  readonly oidcClientId: string;
  readonly oidcClientSecret: string;
  /** `prompt` value for forced re-authentication; "" omits it (Google). */
  readonly oidcReauthPrompt: string;
  /** Lower-cased, verified emails allowed to sign in. Empty = anyone. */
  readonly allowedEmails: readonly string[];
  readonly webauthnRpId: string;
  readonly webauthnRpName: string;
  readonly credentialEncryptionKey: string;

  // ── Realtime ───────────────────────────────────────────────────────────
  readonly realtimeProvider: "openai" | "mock";
  readonly realtimeModel: string;
  readonly sessionTtlSeconds: number;
  readonly stepUpTtlSeconds: number;
  readonly passkeyEnrollmentMaxOidcAgeSeconds: number;
  readonly realtimeSessionRateLimitPerMinute: number;

  /** Non-fatal configuration advice, logged once at startup. */
  readonly warnings: readonly string[];
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
  const warnings: string[] = [];

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

  const boolean = (name: string, fallback: boolean): boolean => {
    const raw = env[name]?.trim().toLowerCase();
    if (!raw) return fallback;
    if (["1", "true", "yes", "on"].includes(raw)) return true;
    if (["0", "false", "no", "off"].includes(raw)) return false;
    problems.push(`${name} must be true or false.`);
    return fallback;
  };

  const list = (name: string): string[] =>
    (env[name] ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

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

  const { trace: logTrace, problems: traceProblems } = parseTraceSpec(env.LOG_TRACE);
  problems.push(...traceProblems);

  const logFormat = (env.LOG_FORMAT?.trim() || (production ? "json" : "pretty")) as
    | "json"
    | "pretty";
  if (logFormat !== "json" && logFormat !== "pretty") {
    problems.push("LOG_FORMAT must be json or pretty.");
  }

  const realtimeProvider = env.REALTIME_PROVIDER?.trim() || "openai";
  if (realtimeProvider !== "openai" && realtimeProvider !== "mock") {
    problems.push("REALTIME_PROVIDER must be openai or mock.");
  }
  if (production && realtimeProvider === "mock") {
    problems.push("REALTIME_PROVIDER=mock is not allowed in production.");
  }

  const originSecrets = list("ORIGIN_SECRET");
  if (originSecrets.some((secret) => secret.length < 32)) {
    problems.push("ORIGIN_SECRET values must be at least 32 characters (openssl rand -hex 32).");
  }
  if (production && originSecrets.length === 0) {
    warnings.push(
      "ORIGIN_SECRET is not set: the API accepts requests that bypass the Vercel proxy.",
    );
  }

  const allowedEmails = list("ALLOWED_EMAILS").map((email) => email.toLowerCase());
  if (production && allowedEmails.length === 0) {
    warnings.push(
      "ALLOWED_EMAILS is empty: any account your identity provider accepts can sign in.",
    );
  }

  const config: AppConfig = {
    production,
    port: positiveInteger("PORT", 3000),
    logLevel,
    logTrace,
    logFormat,
    clientLogIngest: boolean("CLIENT_LOG_INGEST", true),
    telemetryRateLimitPerMinute: positiveInteger("TELEMETRY_RATE_LIMIT_PER_MINUTE", 120),
    auditTrailEnabled: boolean("AUDIT_TRAIL_ENABLED", true),
    auditRetentionDays: positiveInteger("AUDIT_RETENTION_DAYS", 30),
    databaseUrl: required("DATABASE_URL"),
    redisUrl: required("REDIS_URL"),
    publicOrigin: publicOrigin.replace(/\/$/, ""),
    originSecrets,
    trustProxyHops: positiveInteger("TRUST_PROXY_HOPS", 1),
    oidcIssuer,
    oidcClientId: required("OIDC_CLIENT_ID"),
    oidcClientSecret: required("OIDC_CLIENT_SECRET"),
    oidcReauthPrompt: env.OIDC_REAUTH_PROMPT === undefined ? "login" : env.OIDC_REAUTH_PROMPT.trim(),
    allowedEmails,
    webauthnRpId,
    webauthnRpName: env.WEBAUTHN_RP_NAME?.trim() || "Eleanor",
    credentialEncryptionKey,
    realtimeProvider: realtimeProvider as "openai" | "mock",
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
    warnings,
  };

  if (problems.length > 0) {
    throw new ConfigError(problems);
  }

  return config;
}
