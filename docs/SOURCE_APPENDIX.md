# Eleanor v0.7 complete source appendix

## Directory tree

```text
.gitignore
.nvmrc
BENCHMARK.md
BENCHMARK_OBSERVED.json
README.md
RUNBOOK.md
apps/
    api/
        .env.example
        migrations/
            001_assistant_profiles.sql
            002_provider_credentials.sql
            003_passkeys.sql
        package.json
        src/
            auth/
                auth.middleware.ts
                auth.routes.ts
                oidc.service.ts
                session.service.ts
                session.types.ts
            config.ts
            credentials/
                credential-crypto.service.spec.ts
                credential-crypto.service.ts
                credential.repository.ts
                credential.routes.ts
                credential.service.ts
            database.ts
            migrate.ts
            passkeys/
                passkey.repository.ts
                passkey.routes.ts
                passkey.service.ts
            profile/
                profile-metric.ts
                profile.repository.ts
                profile.routes.ts
            rate-limit/
                redis-rate-limit.middleware.ts
            realtime/
                realtime.provider.ts
                realtime.routes.ts
            redis.ts
            server.ts
            types/
                express.d.ts
        tsconfig.json
        vitest.config.ts
    web/
        .postcssrc.json
        angular.json
        package.json
        proxy.conf.json
        src/
            app/
                app.component.ts
                app.routes.ts
                core/
                    audio/
                        audio-levels.service.ts
                    auth/
                        auth.guard.ts
                        auth.service.ts
                    credentials/
                        provider-credential.service.ts
                    passkeys/
                        passkey.service.ts
                    realtime/
                        realtime-voice.service.ts
                        realtime.types.ts
                    settings/
                        assistant-profile-api.service.ts
                        assistant-profile-metric.service.spec.ts
                        assistant-profile-metric.service.ts
                        assistant-settings.service.ts
                        assistant-settings.types.ts
                features/
                    assistant/
                        assistant-page.component.ts
                        passkey-setup-dialog.component.ts
                        provider-credential-dialog.component.ts
                        voice-orb-island.component.ts
                        voice-orb.react.ts
                    auth/
                        login-page.component.ts
                    security/
                        security-page.component.ts
                    settings/
                        settings-page.component.ts
                shared/
                    segmented-control/
                        segmented-control.component.ts
            index.html
            main.ts
            styles.css
        tsconfig.app.json
        tsconfig.json
package.json
playwright.config.ts
scripts/
    benchmark.mjs
tests/
    e2e/
        auth-gate.spec.ts
        provider-gate.spec.ts
        security-bootstrap.spec.ts
        webrtc-local.spec.ts
vercel.json
```

## `.gitignore`

```text
node_modules/
dist/
.angular/
coverage/
playwright-report/
test-results/
.env
.env.*
!.env.example
.DS_Store
```

## `.nvmrc`

```text
22.12.0
```

## `BENCHMARK.md`

```md
# Benchmark summary

Run `npm run benchmark` on the same Node version and region used in production.

The bundled benchmark covers local deterministic hot paths only:

- all 155,520 profile encodings and collision detection
- 25,000 AES-256-GCM encrypt/decrypt round trips
- 100,000 secure random token generations

It does not fabricate network timings.

Suggested production p95 budgets:

| Stage | p95 budget |
| --- | ---: |
| profile encode/decode | < 1 ms |
| Redis session read | < 10 ms |
| Redis rate-limit mutation | < 10 ms |
| PostgreSQL credential/profile read | < 50 ms |
| passkey options server endpoint | < 100 ms |
| passkey verify server endpoint | < 100 ms |
| BFF work before provider call | < 100 ms |
| OpenAI Realtime call creation | measure p50/p95/p99 |
| browser WebRTC negotiation | measure p50/p95/p99 |
| speech-end → first audio | primary user-facing SLO |

WebAuthn ceremony wall-clock time is human/authenticator dependent and should be reported
separately from server verification latency.
```

## `BENCHMARK_OBSERVED.json`

```json
{
  "profile_metric_reference": {
    "profiles": 155520,
    "unique": 155520,
    "collisions": 0,
    "fastest_ms": 31.23,
    "median_ms": 34.52,
    "slowest_ms": 37.07,
    "runtime": "Python reference implementation in artifact-generation environment"
  },
  "aes_256_gcm_reference": {
    "roundtrips": 25000,
    "total_ms": 32.56,
    "per_roundtrip_us": 1.302,
    "runtime": "Python cryptography/OpenSSL reference implementation"
  },
  "secure_token_reference": {
    "tokens": 100000,
    "total_ms": 51.15,
    "per_token_us": 0.511,
    "runtime": "Python secrets reference implementation"
  }
}
```

## `README.md`

```md
# Eleanor v0.7

Realtime voice-first AI assistant with an Angular/React frontend and a thin Node BFF.

Security architecture:

- OpenID Connect Authorization Code + PKCE for account identity
- Redis-backed opaque HttpOnly session cookies
- synchronizer CSRF tokens
- WebAuthn/passkey user verification for sensitive step-up
- AES-256-GCM encryption for user-supplied provider API keys
- PostgreSQL for profiles, provider credentials, and passkeys
- Redis for sessions and distributed rate limiting
- OpenAI Realtime WebRTC bootstrap from the BFF

The browser never persists OAuth tokens or stored provider API keys.

## Run

```bash
npm install
cp apps/api/.env.example apps/api/.env
npm run migrate -w @eleanor/api
npm run dev
```

## Test

```bash
npm test
npx playwright install chromium
npm run test:e2e
npm run benchmark
```

See `RUNBOOK.md` and `BENCHMARK.md`.
```

## `RUNBOOK.md`

```md
# Eleanor v0.7 runbook

## Identity provider

Create a confidential OIDC web application using Authorization Code + PKCE.

Scopes:

```text
openid profile email
```

Callback:

```text
https://YOUR_APP_DOMAIN/api/auth/callback
```

Post logout:

```text
https://YOUR_APP_DOMAIN/
```

## Passkeys

Use:

```env
PUBLIC_ORIGIN=https://YOUR_APP_DOMAIN
WEBAUTHN_RP_ID=YOUR_APP_DOMAIN
WEBAUTHN_RP_NAME=Eleanor
```

`WEBAUTHN_RP_ID` is a domain, not a URL.

The first passkey may be enrolled only within a fresh OIDC session. Additional passkeys
require an existing recent passkey step-up. Passkey ceremonies require user verification.

## Provider credential encryption

Generate:

```bash
openssl rand -base64 32
```

Set the output as `CREDENTIAL_ENCRYPTION_KEY` on Railway only.

## Railway

Railway now prefers Infrastructure as Code. For a new project:

```bash
railway login
railway init
railway config init
```

Provision one API service plus PostgreSQL and Redis.

API build:

```bash
npm ci && npm run build -w @eleanor/api
```

Pre-deploy:

```bash
npm run migrate:prod -w @eleanor/api
```

Start:

```bash
npm run start -w @eleanor/api
```

Health path:

```text
/api/health
```

Variables:

```env
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
PUBLIC_ORIGIN=https://YOUR_APP_DOMAIN
OIDC_ISSUER=https://YOUR_IDP/
OIDC_CLIENT_ID=...
OIDC_CLIENT_SECRET=...
WEBAUTHN_RP_ID=YOUR_APP_DOMAIN
WEBAUTHN_RP_NAME=Eleanor
CREDENTIAL_ENCRYPTION_KEY=...
SESSION_TTL_SECONDS=28800
STEP_UP_TTL_SECONDS=300
PASSKEY_ENROLLMENT_MAX_OIDC_AGE_SECONDS=600
REALTIME_SESSION_RATE_LIMIT_PER_MINUTE=20
```

## Vercel

Deploy the Angular frontend and rewrite `/api/*` to Railway. Keeping `/api` same-origin
allows the production `__Host-eleanor-session` cookie to remain first-party.

## First sign-in

1. `/assistant` redirects to `/login`.
2. OIDC Authorization Code + PKCE completes.
3. Eleanor auto-opens passkey enrollment when no passkey exists.
4. Registration requires authenticator user verification.
5. Successful registration establishes a short step-up window.
6. Eleanor auto-opens provider setup.
7. The provider key is submitted once and encrypted server-side.
8. Activation becomes available.

## Sensitive credential operations

Viewing credential metadata, replacing the key, or deleting it requires a passkey
verification within `STEP_UP_TTL_SECONDS`.

The raw stored API key is never returned to the browser.

## Recovery

OIDC remains the recoverable account identity. A lost passkey does not replace the
identity provider's account recovery process.
```

## `apps/api/.env.example`

```text
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/eleanor
REDIS_URL=redis://localhost:6379
PUBLIC_ORIGIN=http://localhost:4200
OIDC_ISSUER=https://YOUR-IDP.example.com/
OIDC_CLIENT_ID=eleanor
OIDC_CLIENT_SECRET=replace-me
WEBAUTHN_RP_ID=localhost
WEBAUTHN_RP_NAME=Eleanor
CREDENTIAL_ENCRYPTION_KEY=REPLACE_WITH_32_BYTE_BASE64_VALUE
SESSION_TTL_SECONDS=28800
STEP_UP_TTL_SECONDS=300
PASSKEY_ENROLLMENT_MAX_OIDC_AGE_SECONDS=600
REALTIME_SESSION_RATE_LIMIT_PER_MINUTE=20
```

## `apps/api/migrations/001_assistant_profiles.sql`

```sql
CREATE TABLE IF NOT EXISTS assistant_profiles (
    user_id TEXT PRIMARY KEY,
    profile_metric BIGINT NOT NULL,
    schema_version SMALLINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT assistant_profiles_metric_positive CHECK (profile_metric >= 0),
    CONSTRAINT assistant_profiles_schema_version_positive CHECK (schema_version > 0)
);

CREATE INDEX IF NOT EXISTS assistant_profiles_updated_at_idx
    ON assistant_profiles (updated_at);
```

## `apps/api/migrations/002_provider_credentials.sql`

```sql
CREATE TABLE IF NOT EXISTS user_provider_credentials (
    user_id TEXT PRIMARY KEY,
    provider VARCHAR(32) NOT NULL,
    encrypted_api_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT provider_supported CHECK (provider IN ('openai'))
);

CREATE INDEX IF NOT EXISTS user_provider_credentials_provider_idx
    ON user_provider_credentials (provider);
```

## `apps/api/migrations/003_passkeys.sql`

```sql
CREATE TABLE IF NOT EXISTS user_passkeys (
    credential_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    public_key BYTEA NOT NULL,
    counter BIGINT NOT NULL DEFAULT 0,
    transports TEXT[] NOT NULL DEFAULT '{}',
    device_type VARCHAR(32) NOT NULL,
    backed_up BOOLEAN NOT NULL DEFAULT FALSE,
    name VARCHAR(120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS user_passkeys_user_id_idx
    ON user_passkeys (user_id);

CREATE INDEX IF NOT EXISTS user_passkeys_last_used_at_idx
    ON user_passkeys (last_used_at);
```

## `apps/api/package.json`

```json
{
  "name": "@eleanor/api",
  "version": "0.7.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "migrate": "tsx src/migrate.ts",
    "migrate:prod": "node dist/migrate.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@simplewebauthn/server": "^14.0.0",
    "cookie": "^1.0.2",
    "dotenv": "^16.6.0",
    "express": "^5.1.0",
    "helmet": "^8.1.0",
    "openid-client": "^6.8.7",
    "pg": "^8.16.0",
    "redis": "^5.8.0",
    "zod": "^4.1.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.3",
    "@types/node": "^22.15.0",
    "@types/pg": "^8.15.0",
    "tsx": "^4.20.0",
    "typescript": "~5.8.3",
    "vitest": "^3.2.0"
  }
}
```

## `apps/api/src/auth/auth.middleware.ts`

```ts
import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

import { SessionService } from "./session.service.js";

export function attachSession(
  sessions: SessionService,
): RequestHandler {
  return async (request, _response, next) => {
    request.eleanorSession =
      (await sessions.get(request)) ?? undefined;
    next();
  };
}

export function requireAuthentication(): RequestHandler {
  return (request, response, next) => {
    if (!request.eleanorSession?.data.user) {
      response.status(401).json({
        error: "Authentication required.",
        code: "AUTHENTICATION_REQUIRED",
      });
      return;
    }

    next();
  };
}

export function requireCsrf(): RequestHandler {
  return (request, response, next) => {
    const expected = request.eleanorSession?.data.csrfToken;
    const received = request.header("x-csrf-token");

    if (!expected || !received || !safeEqual(expected, received)) {
      response.status(403).json({
        error: "CSRF validation failed.",
        code: "CSRF_VALIDATION_FAILED",
      });
      return;
    }

    next();
  };
}

export function requireRecentStepUp(
  maxAgeSeconds: number,
): RequestHandler {
  return (request, response, next) => {
    const verifiedAt =
      request.eleanorSession?.data.stepUpVerifiedAt;

    if (
      !verifiedAt ||
      Date.now() - verifiedAt > maxAgeSeconds * 1_000
    ) {
      response.status(428).json({
        error: "Passkey verification is required.",
        code: "STEP_UP_REQUIRED",
      });
      return;
    }

    next();
  };
}

function safeEqual(leftValue: string, rightValue: string): boolean {
  const left = Buffer.from(leftValue, "utf8");
  const right = Buffer.from(rightValue, "utf8");

  return (
    left.length === right.length &&
    timingSafeEqual(left, right)
  );
}
```

## `apps/api/src/auth/auth.routes.ts`

```ts
import { Router } from "express";

import {
  requireAuthentication,
  requireCsrf,
} from "./auth.middleware.js";
import { OidcService } from "./oidc.service.js";
import { SessionService } from "./session.service.js";

export function createAuthRouter(
  sessions: SessionService,
  oidc: OidcService,
  publicOrigin: string,
): Router {
  const router = Router();

  router.get("/session", async (request, response) => {
    const session = await sessions.ensure(request, response);

    response
      .set("Cache-Control", "no-store")
      .json({
        authenticated: Boolean(session.data.user),
        user: session.data.user ?? null,
        csrfToken: session.data.csrfToken,
      });
  });

  router.get("/login", async (request, response) => {
    const session = await sessions.ensure(request, response);

    if (session.data.user) {
      response.redirect(new URL("/assistant", publicOrigin).href);
      return;
    }

    const returnTo =
      typeof request.query.returnTo === "string"
        ? request.query.returnTo
        : "/assistant";

    const flow = await oidc.begin(returnTo);

    await sessions.save({
      ...session,
      data: {
        ...session.data,
        oidc: flow.transaction,
      },
    });

    response.redirect(flow.authorizationUrl.href);
  });

  router.get("/callback", async (request, response) => {
    const session = request.eleanorSession;
    const transaction = session?.data.oidc;

    if (!session || !transaction) {
      response.status(400).send(
        "Authentication transaction was not found.",
      );
      return;
    }

    try {
      const completed = await oidc.complete(
        new URL(request.originalUrl, publicOrigin),
        transaction,
      );

      await sessions.rotate(
        session,
        response,
        {
          csrfToken: sessions.randomToken(),
          createdAt: Date.now(),
          authenticatedAt: Date.now(),
          user: completed.user,
          idTokenHint: completed.idTokenHint,
        },
      );

      response.redirect(
        new URL(transaction.returnTo, publicOrigin).href,
      );
    } catch (error) {
      console.error("OIDC callback failed:", error);
      response.status(401).send(
        "Authentication could not be completed.",
      );
    }
  });

  router.post(
    "/logout",
    requireAuthentication(),
    requireCsrf(),
    async (request, response) => {
      const session = request.eleanorSession!;
      const logoutUrl =
        oidc.logoutUrl(session.data.idTokenHint) ??
        publicOrigin;

      await sessions.destroy(session, response);

      response.json({ logoutUrl });
    },
  );

  return router;
}
```

## `apps/api/src/auth/oidc.service.ts`

```ts
import * as oidc from "openid-client";

import type {
  EleanorUser,
  OidcTransaction,
} from "./session.types.js";

export class OidcService {
  private constructor(
    private readonly configuration: oidc.Configuration,
    private readonly publicOrigin: string,
  ) {}

  static async create(config: {
    readonly issuer: string;
    readonly clientId: string;
    readonly clientSecret: string;
    readonly publicOrigin: string;
  }): Promise<OidcService> {
    const configuration = await oidc.discovery(
      new URL(config.issuer),
      config.clientId,
      config.clientSecret,
    );

    return new OidcService(configuration, config.publicOrigin);
  }

  async begin(returnTo: string): Promise<{
    readonly transaction: OidcTransaction;
    readonly authorizationUrl: URL;
  }> {
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();

    const transaction: OidcTransaction = {
      codeVerifier,
      state,
      nonce,
      returnTo: sanitizeReturnTo(returnTo),
      createdAt: Date.now(),
    };

    return {
      transaction,
      authorizationUrl: oidc.buildAuthorizationUrl(
        this.configuration,
        {
          redirect_uri: this.callbackUrl(),
          scope: "openid profile email",
          code_challenge:
            await oidc.calculatePKCECodeChallenge(codeVerifier),
          code_challenge_method: "S256",
          state,
          nonce,
        },
      ),
    };
  }

  async complete(
    callbackUrl: URL,
    transaction: OidcTransaction,
  ): Promise<{
    readonly user: EleanorUser;
    readonly idTokenHint?: string;
  }> {
    if (Date.now() - transaction.createdAt > 600_000) {
      throw new Error("Authentication transaction expired.");
    }

    const tokens = await oidc.authorizationCodeGrant(
      this.configuration,
      callbackUrl,
      {
        pkceCodeVerifier: transaction.codeVerifier,
        expectedState: transaction.state,
        expectedNonce: transaction.nonce,
        idTokenExpected: true,
      },
    );

    const claims = tokens.claims();

    if (!claims?.sub) {
      throw new Error("OIDC provider did not return a subject.");
    }

    return {
      user: {
        id: claims.sub,
        name: typeof claims.name === "string" ? claims.name : undefined,
        email: typeof claims.email === "string" ? claims.email : undefined,
        picture:
          typeof claims.picture === "string"
            ? claims.picture
            : undefined,
      },
      idTokenHint: tokens.id_token,
    };
  }

  logoutUrl(idTokenHint?: string): string | null {
    try {
      return oidc.buildEndSessionUrl(
        this.configuration,
        {
          post_logout_redirect_uri: this.publicOrigin,
          ...(idTokenHint
            ? { id_token_hint: idTokenHint }
            : {}),
        },
      ).href;
    } catch {
      return null;
    }
  }

  private callbackUrl(): string {
    return new URL(
      "/api/auth/callback",
      this.publicOrigin,
    ).href;
  }
}

function sanitizeReturnTo(value: string): string {
  return (
    value.startsWith("/") &&
    !value.startsWith("//")
  )
    ? value
    : "/assistant";
}
```

## `apps/api/src/auth/session.service.ts`

```ts
import { randomBytes } from "node:crypto";
import { parse, serialize } from "cookie";
import type { Request, Response } from "express";

import type { RedisClient } from "../redis.js";
import type { EleanorSession, SessionContext } from "./session.types.js";

export class SessionService {
  private readonly cookieName: string;

  constructor(
    private readonly redis: RedisClient,
    private readonly config: {
      readonly production: boolean;
      readonly ttlSeconds: number;
    },
  ) {
    this.cookieName = config.production
      ? "__Host-eleanor-session"
      : "eleanor-session";
  }

  async get(request: Request): Promise<SessionContext | null> {
    const cookieHeader = request.headers.cookie;

    if (!cookieHeader) {
      return null;
    }

    const sessionId = parse(cookieHeader)[this.cookieName];

    if (!sessionId) {
      return null;
    }

    const raw = await this.redis.get(this.key(sessionId));

    if (!raw) {
      return null;
    }

    try {
      return {
        id: sessionId,
        data: JSON.parse(raw) as EleanorSession,
      };
    } catch {
      await this.redis.del(this.key(sessionId));
      return null;
    }
  }

  async ensure(
    request: Request,
    response: Response,
  ): Promise<SessionContext> {
    const existing = await this.get(request);

    if (existing) {
      return existing;
    }

    const session: SessionContext = {
      id: this.randomToken(),
      data: this.freshData(),
    };

    await this.save(session);
    this.setCookie(response, session.id);

    return session;
  }

  async save(session: SessionContext): Promise<void> {
    await this.redis.set(
      this.key(session.id),
      JSON.stringify(session.data),
      { EX: this.config.ttlSeconds },
    );
  }

  async rotate(
    current: SessionContext,
    response: Response,
    data: EleanorSession,
  ): Promise<SessionContext> {
    const next: SessionContext = {
      id: this.randomToken(),
      data,
    };

    await this.redis
      .multi()
      .del(this.key(current.id))
      .set(
        this.key(next.id),
        JSON.stringify(next.data),
        { EX: this.config.ttlSeconds },
      )
      .exec();

    this.setCookie(response, next.id);
    return next;
  }

  async destroy(
    session: SessionContext,
    response: Response,
  ): Promise<void> {
    await this.redis.del(this.key(session.id));

    response.append(
      "Set-Cookie",
      serialize(this.cookieName, "", {
        path: "/",
        httpOnly: true,
        secure: this.config.production,
        sameSite: "lax",
        maxAge: 0,
      }),
    );
  }

  randomToken(): string {
    return randomBytes(32).toString("base64url");
  }

  private freshData(): EleanorSession {
    return {
      csrfToken: this.randomToken(),
      createdAt: Date.now(),
    };
  }

  private setCookie(response: Response, sessionId: string): void {
    response.append(
      "Set-Cookie",
      serialize(this.cookieName, sessionId, {
        path: "/",
        httpOnly: true,
        secure: this.config.production,
        sameSite: "lax",
        maxAge: this.config.ttlSeconds,
      }),
    );
  }

  private key(sessionId: string): string {
    return `session:${sessionId}`;
  }
}
```

## `apps/api/src/auth/session.types.ts`

```ts
export interface EleanorUser {
  readonly id: string;
  readonly name?: string;
  readonly email?: string;
  readonly picture?: string;
}

export interface OidcTransaction {
  readonly codeVerifier: string;
  readonly state: string;
  readonly nonce: string;
  readonly returnTo: string;
  readonly createdAt: number;
}

export interface WebAuthnCeremony {
  readonly type: "registration" | "authentication";
  readonly challenge: string;
  readonly createdAt: number;
}

export interface EleanorSession {
  readonly csrfToken: string;
  readonly createdAt: number;
  readonly authenticatedAt?: number;
  readonly user?: EleanorUser;
  readonly oidc?: OidcTransaction;
  readonly idTokenHint?: string;
  readonly webauthn?: WebAuthnCeremony;
  readonly stepUpVerifiedAt?: number;
  readonly stepUpCredentialId?: string;
}

export interface SessionContext {
  readonly id: string;
  readonly data: EleanorSession;
}
```

## `apps/api/src/config.ts`

```ts
export interface AppConfig {
  readonly production: boolean;
  readonly port: number;
  readonly databaseUrl: string;
  readonly redisUrl: string;
  readonly publicOrigin: string;
  readonly oidcIssuer: string;
  readonly oidcClientId: string;
  readonly oidcClientSecret: string;
  readonly webauthnRpId: string;
  readonly webauthnRpName: string;
  readonly credentialEncryptionKey: string;
  readonly sessionTtlSeconds: number;
  readonly stepUpTtlSeconds: number;
  readonly passkeyEnrollmentMaxOidcAgeSeconds: number;
  readonly realtimeSessionRateLimitPerMinute: number;
}

function required(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function positiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];

  if (!raw) {
    return fallback;
  }

  const value = Number(raw);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return value;
}

export function loadConfig(): AppConfig {
  return {
    production: process.env.NODE_ENV === "production",
    port: positiveInteger("PORT", 3000),
    databaseUrl: required("DATABASE_URL"),
    redisUrl: required("REDIS_URL"),
    publicOrigin: required("PUBLIC_ORIGIN"),
    oidcIssuer: required("OIDC_ISSUER"),
    oidcClientId: required("OIDC_CLIENT_ID"),
    oidcClientSecret: required("OIDC_CLIENT_SECRET"),
    webauthnRpId: required("WEBAUTHN_RP_ID"),
    webauthnRpName: required("WEBAUTHN_RP_NAME"),
    credentialEncryptionKey: required("CREDENTIAL_ENCRYPTION_KEY"),
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
}
```

## `apps/api/src/credentials/credential-crypto.service.spec.ts`

```ts
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import { CredentialCryptoService } from "./credential-crypto.service.js";

describe("CredentialCryptoService", () => {
  it("round-trips with authenticated encryption", () => {
    const crypto = new CredentialCryptoService(
      randomBytes(32).toString("base64"),
    );

    const secret = "sk-example-provider-secret";
    const encrypted = crypto.encrypt(secret);

    expect(encrypted).not.toContain(secret);
    expect(crypto.decrypt(encrypted)).toBe(secret);
  });
});
```

## `apps/api/src/credentials/credential-crypto.service.ts`

```ts
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const VERSION = 1;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export class CredentialCryptoService {
  private readonly key: Buffer;

  constructor(base64Key: string) {
    this.key = Buffer.from(base64Key, "base64");

    if (this.key.length !== 32) {
      throw new Error(
        "CREDENTIAL_ENCRYPTION_KEY must decode to exactly 32 bytes.",
      );
    }
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(
      "aes-256-gcm",
      this.key,
      iv,
    );

    const ciphertext = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);

    return Buffer.concat([
      Buffer.from([VERSION]),
      iv,
      cipher.getAuthTag(),
      ciphertext,
    ]).toString("base64");
  }

  decrypt(envelope: string): string {
    const payload = Buffer.from(envelope, "base64");

    if (payload[0] !== VERSION) {
      throw new Error(
        `Unsupported credential encryption version: ${payload[0]}.`,
      );
    }

    const iv = payload.subarray(1, 1 + IV_LENGTH);
    const tag = payload.subarray(
      1 + IV_LENGTH,
      1 + IV_LENGTH + TAG_LENGTH,
    );
    const ciphertext = payload.subarray(
      1 + IV_LENGTH + TAG_LENGTH,
    );

    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      iv,
    );

    decipher.setAuthTag(tag);

    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  }
}
```

## `apps/api/src/credentials/credential.repository.ts`

```ts
import type { Pool } from "pg";

export type AiProvider = "openai";

export interface StoredCredential {
  readonly provider: AiProvider;
  readonly encryptedApiKey: string;
  readonly updatedAt: string;
}

interface CredentialRow {
  readonly provider: AiProvider;
  readonly encrypted_api_key: string;
  readonly updated_at: Date;
}

export interface CredentialRepository {
  find(userId: string): Promise<StoredCredential | null>;
  upsert(
    userId: string,
    provider: AiProvider,
    encryptedApiKey: string,
  ): Promise<void>;
  delete(userId: string): Promise<void>;
}

export function createCredentialRepository(
  database: Pool,
): CredentialRepository {
  return {
    async find(userId) {
      const result = await database.query<CredentialRow>(
        `
          SELECT provider, encrypted_api_key, updated_at
          FROM user_provider_credentials
          WHERE user_id = $1
        `,
        [userId],
      );

      const row = result.rows[0];

      return row
        ? {
            provider: row.provider,
            encryptedApiKey: row.encrypted_api_key,
            updatedAt: row.updated_at.toISOString(),
          }
        : null;
    },

    async upsert(userId, provider, encryptedApiKey) {
      await database.query(
        `
          INSERT INTO user_provider_credentials (
            user_id,
            provider,
            encrypted_api_key
          )
          VALUES ($1, $2, $3)
          ON CONFLICT (user_id)
          DO UPDATE SET
            provider = EXCLUDED.provider,
            encrypted_api_key = EXCLUDED.encrypted_api_key,
            updated_at = NOW()
        `,
        [userId, provider, encryptedApiKey],
      );
    },

    async delete(userId) {
      await database.query(
        `
          DELETE FROM user_provider_credentials
          WHERE user_id = $1
        `,
        [userId],
      );
    },
  };
}
```

## `apps/api/src/credentials/credential.routes.ts`

```ts
import { Router } from "express";
import { z } from "zod";

import {
  requireAuthentication,
  requireCsrf,
  requireRecentStepUp,
} from "../auth/auth.middleware.js";
import { CredentialService } from "./credential.service.js";

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
```

## `apps/api/src/credentials/credential.service.ts`

```ts
import { CredentialCryptoService } from "./credential-crypto.service.js";
import type {
  AiProvider,
  CredentialRepository,
} from "./credential.repository.js";

export class CredentialService {
  constructor(
    private readonly repository: CredentialRepository,
    private readonly crypto: CredentialCryptoService,
  ) {}

  async status(userId: string) {
    const credential = await this.repository.find(userId);

    return {
      configured: Boolean(credential),
      provider: credential?.provider ?? null,
    };
  }

  async details(userId: string) {
    const credential = await this.repository.find(userId);

    if (!credential) {
      return null;
    }

    return {
      provider: credential.provider,
      maskedApiKey: "••••••••••••",
      updatedAt: credential.updatedAt,
    };
  }

  async save(
    userId: string,
    provider: AiProvider,
    apiKey: string,
  ): Promise<void> {
    await this.repository.upsert(
      userId,
      provider,
      this.crypto.encrypt(apiKey),
    );
  }

  async getProviderSecret(userId: string) {
    const credential = await this.repository.find(userId);

    if (!credential) {
      return null;
    }

    return {
      provider: credential.provider,
      apiKey: this.crypto.decrypt(
        credential.encryptedApiKey,
      ),
    };
  }

  async remove(userId: string): Promise<void> {
    await this.repository.delete(userId);
  }
}
```

## `apps/api/src/database.ts`

```ts
import { Pool } from "pg";

export function createDatabase(databaseUrl: string): Pool {
  return new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000
  });
}
```

## `apps/api/src/migrate.ts`

```ts
import "dotenv/config";

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const currentFile = fileURLToPath(import.meta.url);
const directory = path.resolve(
  path.dirname(currentFile),
  "../migrations",
);

const database = new Pool({
  connectionString: databaseUrl,
  max: 1
});

try {
  const migrations = (await readdir(directory))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const migration of migrations) {
    console.log(`Applying ${migration}`);
    await database.query(
      await readFile(path.join(directory, migration), "utf8"),
    );
  }
} finally {
  await database.end();
}
```

## `apps/api/src/passkeys/passkey.repository.ts`

```ts
import type { Pool } from "pg";
import type {
  AuthenticatorTransportFuture,
  CredentialDeviceType,
} from "@simplewebauthn/server";

export interface StoredPasskey {
  readonly credentialId: string;
  readonly userId: string;
  readonly publicKey: Buffer;
  readonly counter: number;
  readonly transports: readonly AuthenticatorTransportFuture[];
  readonly deviceType: CredentialDeviceType;
  readonly backedUp: boolean;
  readonly name: string | null;
  readonly createdAt: string;
  readonly lastUsedAt: string | null;
}

interface PasskeyRow {
  readonly credential_id: string;
  readonly user_id: string;
  readonly public_key: Buffer;
  readonly counter: string;
  readonly transports: string[];
  readonly device_type: CredentialDeviceType;
  readonly backed_up: boolean;
  readonly name: string | null;
  readonly created_at: Date;
  readonly last_used_at: Date | null;
}

export interface PasskeyRepository {
  listForUser(userId: string): Promise<readonly StoredPasskey[]>;
  findForUser(
    userId: string,
    credentialId: string,
  ): Promise<StoredPasskey | null>;
  insert(
    passkey: Omit<StoredPasskey, "createdAt" | "lastUsedAt">,
  ): Promise<void>;
  updateCounter(
    userId: string,
    credentialId: string,
    counter: number,
  ): Promise<void>;
}

export function createPasskeyRepository(
  database: Pool,
): PasskeyRepository {
  return {
    async listForUser(userId) {
      const result = await database.query<PasskeyRow>(
        `
          SELECT
            credential_id,
            user_id,
            public_key,
            counter,
            transports,
            device_type,
            backed_up,
            name,
            created_at,
            last_used_at
          FROM user_passkeys
          WHERE user_id = $1
          ORDER BY created_at ASC
        `,
        [userId],
      );

      return result.rows.map(mapRow);
    },

    async findForUser(userId, credentialId) {
      const result = await database.query<PasskeyRow>(
        `
          SELECT
            credential_id,
            user_id,
            public_key,
            counter,
            transports,
            device_type,
            backed_up,
            name,
            created_at,
            last_used_at
          FROM user_passkeys
          WHERE user_id = $1
            AND credential_id = $2
        `,
        [userId, credentialId],
      );

      const row = result.rows[0];
      return row ? mapRow(row) : null;
    },

    async insert(passkey) {
      await database.query(
        `
          INSERT INTO user_passkeys (
            credential_id,
            user_id,
            public_key,
            counter,
            transports,
            device_type,
            backed_up,
            name
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (credential_id) DO NOTHING
        `,
        [
          passkey.credentialId,
          passkey.userId,
          passkey.publicKey,
          String(passkey.counter),
          [...passkey.transports],
          passkey.deviceType,
          passkey.backedUp,
          passkey.name,
        ],
      );
    },

    async updateCounter(userId, credentialId, counter) {
      await database.query(
        `
          UPDATE user_passkeys
          SET
            counter = $3,
            last_used_at = NOW()
          WHERE user_id = $1
            AND credential_id = $2
        `,
        [userId, credentialId, String(counter)],
      );
    },
  };
}

function mapRow(row: PasskeyRow): StoredPasskey {
  const counter = Number(row.counter);

  if (!Number.isSafeInteger(counter) || counter < 0) {
    throw new Error(
      `Unsupported WebAuthn signature counter: ${row.counter}.`,
    );
  }

  return {
    credentialId: row.credential_id,
    userId: row.user_id,
    publicKey: row.public_key,
    counter,
    transports:
      row.transports as AuthenticatorTransportFuture[],
    deviceType: row.device_type,
    backedUp: row.backed_up,
    name: row.name,
    createdAt: row.created_at.toISOString(),
    lastUsedAt:
      row.last_used_at?.toISOString() ?? null,
  };
}
```

## `apps/api/src/passkeys/passkey.routes.ts`

```ts
import { Router } from "express";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";

import {
  requireAuthentication,
  requireCsrf,
} from "../auth/auth.middleware.js";
import {
  PasskeyPolicyError,
  PasskeyService,
} from "./passkey.service.js";

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
```

## `apps/api/src/passkeys/passkey.service.ts`

```ts
import { createHash } from "node:crypto";

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";

import { SessionService } from "../auth/session.service.js";
import type { SessionContext } from "../auth/session.types.js";
import type { PasskeyRepository } from "./passkey.repository.js";

const CEREMONY_TTL_MS = 5 * 60 * 1_000;

export class PasskeyService {
  constructor(
    private readonly repository: PasskeyRepository,
    private readonly sessions: SessionService,
    private readonly config: {
      readonly rpId: string;
      readonly rpName: string;
      readonly expectedOrigin: string;
      readonly enrollmentMaxOidcAgeSeconds: number;
    },
  ) {}

  async status(session: SessionContext) {
    const user = requireUser(session);
    const passkeys = await this.repository.listForUser(user.id);

    return {
      registered: passkeys.length > 0,
      count: passkeys.length,
      stepUpVerifiedAt:
        session.data.stepUpVerifiedAt ?? null,
    };
  }

  async registrationOptions(session: SessionContext) {
    const user = requireUser(session);
    const passkeys = await this.repository.listForUser(user.id);

    if (
      passkeys.length > 0 &&
      !this.hasRecentStepUp(session)
    ) {
      throw new PasskeyPolicyError(
        "Verify an existing passkey before adding another.",
        "STEP_UP_REQUIRED",
        428,
      );
    }

    if (
      passkeys.length === 0 &&
      !this.hasRecentOidcAuthentication(session)
    ) {
      throw new PasskeyPolicyError(
        "Sign in again before enrolling the first passkey.",
        "RECENT_LOGIN_REQUIRED",
        428,
      );
    }

    const options = await generateRegistrationOptions({
      rpName: this.config.rpName,
      rpID: this.config.rpId,
      userID: this.stableUserId(user.id),
      userName: user.email ?? user.id,
      userDisplayName:
        user.name ?? user.email ?? "Eleanor user",
      attestationType: "none",
      excludeCredentials: passkeys.map((passkey) => ({
        id: passkey.credentialId,
        transports: [...passkey.transports],
      })),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "required",
      },
    });

    await this.sessions.save({
      ...session,
      data: {
        ...session.data,
        webauthn: {
          type: "registration",
          challenge: options.challenge,
          createdAt: Date.now(),
        },
      },
    });

    return options;
  }

  async verifyRegistration(
    session: SessionContext,
    response: RegistrationResponseJSON,
  ) {
    const ceremony = this.requireCeremony(
      session,
      "registration",
    );

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: ceremony.challenge,
      expectedOrigin: this.config.expectedOrigin,
      expectedRPID: this.config.rpId,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new PasskeyPolicyError(
        "Passkey registration could not be verified.",
        "PASSKEY_REGISTRATION_FAILED",
        400,
      );
    }

    const user = requireUser(session);
    const {
      credential,
      credentialDeviceType,
      credentialBackedUp,
    } = verification.registrationInfo;

    await this.repository.insert({
      credentialId: credential.id,
      userId: user.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? [],
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      name: null,
    });

    const verifiedAt = Date.now();

    await this.sessions.save({
      ...session,
      data: {
        ...session.data,
        webauthn: undefined,
        stepUpVerifiedAt: verifiedAt,
        stepUpCredentialId: credential.id,
      },
    });

    return {
      verified: true,
      stepUpVerifiedAt: verifiedAt,
    };
  }

  async authenticationOptions(session: SessionContext) {
    const user = requireUser(session);
    const passkeys = await this.repository.listForUser(user.id);

    if (passkeys.length === 0) {
      throw new PasskeyPolicyError(
        "Register a passkey before step-up verification.",
        "PASSKEY_REQUIRED",
        409,
      );
    }

    const options = await generateAuthenticationOptions({
      rpID: this.config.rpId,
      userVerification: "required",
      allowCredentials: passkeys.map((passkey) => ({
        id: passkey.credentialId,
        transports: [...passkey.transports],
      })),
    });

    await this.sessions.save({
      ...session,
      data: {
        ...session.data,
        webauthn: {
          type: "authentication",
          challenge: options.challenge,
          createdAt: Date.now(),
        },
      },
    });

    return options;
  }

  async verifyAuthentication(
    session: SessionContext,
    response: AuthenticationResponseJSON,
  ) {
    const ceremony = this.requireCeremony(
      session,
      "authentication",
    );

    const user = requireUser(session);

    const passkey = await this.repository.findForUser(
      user.id,
      response.id,
    );

    if (!passkey) {
      throw new PasskeyPolicyError(
        "The selected passkey is not registered to this account.",
        "PASSKEY_NOT_FOUND",
        400,
      );
    }

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: ceremony.challenge,
      expectedOrigin: this.config.expectedOrigin,
      expectedRPID: this.config.rpId,
      requireUserVerification: true,
      credential: {
        id: passkey.credentialId,
        publicKey: new Uint8Array(passkey.publicKey),
        counter: passkey.counter,
        transports: [...passkey.transports],
      },
    });

    if (!verification.verified) {
      throw new PasskeyPolicyError(
        "Passkey verification failed.",
        "PASSKEY_AUTHENTICATION_FAILED",
        401,
      );
    }

    await this.repository.updateCounter(
      user.id,
      passkey.credentialId,
      verification.authenticationInfo.newCounter,
    );

    const verifiedAt = Date.now();

    await this.sessions.save({
      ...session,
      data: {
        ...session.data,
        webauthn: undefined,
        stepUpVerifiedAt: verifiedAt,
        stepUpCredentialId: passkey.credentialId,
      },
    });

    return {
      verified: true,
      stepUpVerifiedAt: verifiedAt,
    };
  }

  private requireCeremony(
    session: SessionContext,
    type: "registration" | "authentication",
  ) {
    const ceremony = session.data.webauthn;

    if (
      !ceremony ||
      ceremony.type !== type ||
      Date.now() - ceremony.createdAt > CEREMONY_TTL_MS
    ) {
      throw new PasskeyPolicyError(
        "WebAuthn ceremony expired. Start again.",
        "WEBAUTHN_CEREMONY_EXPIRED",
        400,
      );
    }

    return ceremony;
  }

  private stableUserId(userId: string): Uint8Array {
    return createHash("sha256")
      .update(userId, "utf8")
      .digest();
  }

  private hasRecentOidcAuthentication(
    session: SessionContext,
  ): boolean {
    const authenticatedAt = session.data.authenticatedAt;

    return Boolean(
      authenticatedAt &&
      Date.now() - authenticatedAt <=
        this.config.enrollmentMaxOidcAgeSeconds * 1_000,
    );
  }

  private hasRecentStepUp(session: SessionContext): boolean {
    const verifiedAt = session.data.stepUpVerifiedAt;

    return Boolean(
      verifiedAt &&
      Date.now() - verifiedAt <= CEREMONY_TTL_MS,
    );
  }
}

export class PasskeyPolicyError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PasskeyPolicyError";
  }
}

function requireUser(session: SessionContext) {
  const user = session.data.user;

  if (!user) {
    throw new PasskeyPolicyError(
      "Authentication required.",
      "AUTHENTICATION_REQUIRED",
      401,
    );
  }

  return user;
}
```

## `apps/api/src/profile/profile-metric.ts`

```ts
export interface DecodedAssistantProfile {
  readonly personality: "professional" | "warm" | "witty" | "direct";
  readonly verbosity: "brief" | "balanced" | "detailed";
  readonly formality: "casual" | "neutral" | "formal";
  readonly initiative: "reactive" | "balanced" | "proactive";
  readonly turnTaking: "patient" | "balanced" | "quick";
  readonly humor: number;
  readonly speechSpeed: number;
  readonly voice:
    | "alloy"
    | "ash"
    | "ballad"
    | "coral"
    | "echo"
    | "sage"
    | "shimmer"
    | "verse"
    | "marin"
    | "cedar";
}

const PERSONALITIES = ["professional", "warm", "witty", "direct"] as const;
const VERBOSITIES = ["brief", "balanced", "detailed"] as const;
const FORMALITIES = ["casual", "neutral", "formal"] as const;
const INITIATIVES = ["reactive", "balanced", "proactive"] as const;
const TURNS = ["patient", "balanced", "quick"] as const;
const HUMORS = [0, 1, 2, 3] as const;
const SPEEDS = [0.75,0.8,0.85,0.9,0.95,1,1.05,1.1,1.15,1.2,1.25,1.3] as const;
const VOICES = ["alloy","ash","ballad","coral","echo","sage","shimmer","verse","marin","cedar"] as const;
const W = { personality:1, verbosity:4, formality:12, initiative:36, turn:108, humor:324, speed:1296, voice:15552 } as const;

export const DEFAULT_PROFILE_METRIC = 1_131_380n;

export function validateProfileMetric(input: unknown) {
  const raw = String(input).trim();

  if (!/^\d+$/.test(raw)) {
    throw new Error("Profile metric must contain digits only.");
  }

  const value = BigInt(raw);

  if (value < 1_000_000n || value > 1_155_519n) {
    throw new Error("Profile metric is outside the supported v1 range.");
  }

  return {
    value,
    version: 1,
  };
}

export function decodeProfileMetric(input: unknown): DecodedAssistantProfile {
  const payload = Number(
    validateProfileMetric(input).value - 1_000_000n,
  );
  const digit = (weight: number, radix: number) =>
    Math.floor(payload / weight) % radix;

  return {
    personality: PERSONALITIES[digit(W.personality, PERSONALITIES.length)],
    verbosity: VERBOSITIES[digit(W.verbosity, VERBOSITIES.length)],
    formality: FORMALITIES[digit(W.formality, FORMALITIES.length)],
    initiative: INITIATIVES[digit(W.initiative, INITIATIVES.length)],
    turnTaking: TURNS[digit(W.turn, TURNS.length)],
    humor: HUMORS[digit(W.humor, HUMORS.length)],
    speechSpeed: SPEEDS[digit(W.speed, SPEEDS.length)],
    voice: VOICES[digit(W.voice, VOICES.length)],
  };
}
```

## `apps/api/src/profile/profile.repository.ts`

```ts
import type { Pool } from "pg";

export interface StoredAssistantProfile {
  readonly metric: string;
  readonly schemaVersion: number;
  readonly updatedAt: string;
}

interface Row {
  readonly profile_metric: string;
  readonly schema_version: number;
  readonly updated_at: Date;
}

export interface AssistantProfileRepository {
  find(userId: string): Promise<StoredAssistantProfile | null>;
  upsert(
    userId: string,
    metric: bigint,
    schemaVersion: number,
  ): Promise<StoredAssistantProfile>;
}

export function createAssistantProfileRepository(
  database: Pool,
): AssistantProfileRepository {
  return {
    async find(userId) {
      const result = await database.query<Row>(
        `
          SELECT profile_metric, schema_version, updated_at
          FROM assistant_profiles
          WHERE user_id = $1
        `,
        [userId],
      );

      const row = result.rows[0];

      return row
        ? {
            metric: row.profile_metric,
            schemaVersion: row.schema_version,
            updatedAt: row.updated_at.toISOString(),
          }
        : null;
    },

    async upsert(userId, metric, schemaVersion) {
      const result = await database.query<Row>(
        `
          INSERT INTO assistant_profiles (
            user_id, profile_metric, schema_version
          )
          VALUES ($1, $2, $3)
          ON CONFLICT (user_id)
          DO UPDATE SET
            profile_metric = EXCLUDED.profile_metric,
            schema_version = EXCLUDED.schema_version,
            updated_at = NOW()
          RETURNING profile_metric, schema_version, updated_at
        `,
        [userId, metric.toString(), schemaVersion],
      );

      const row = result.rows[0];

      if (!row) {
        throw new Error("Database did not return the saved profile.");
      }

      return {
        metric: row.profile_metric,
        schemaVersion: row.schema_version,
        updatedAt: row.updated_at.toISOString(),
      };
    },
  };
}
```

## `apps/api/src/profile/profile.routes.ts`

```ts
import { Router } from "express";

import {
  requireAuthentication,
  requireCsrf,
} from "../auth/auth.middleware.js";
import { validateProfileMetric } from "./profile-metric.js";
import type { AssistantProfileRepository } from "./profile.repository.js";

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
```

## `apps/api/src/rate-limit/redis-rate-limit.middleware.ts`

```ts
import type { RequestHandler } from "express";
import type { RedisClient } from "../redis.js";

export function createRedisRateLimitMiddleware(
  redis: RedisClient,
  limit: number,
): RequestHandler {
  return async (request, response, next) => {
    const userId = request.eleanorSession?.data.user?.id;

    if (!userId) {
      response.status(401).json({
        error: "Authentication required.",
      });
      return;
    }

    const seconds = 60;
    const bucket = Math.floor(Date.now() / (seconds * 1000));
    const key = `rate:realtime:${userId}:${bucket}`;

    try {
      const count = await redis.incr(key);

      if (count === 1) {
        await redis.expire(key, seconds + 2);
      }

      response.setHeader("RateLimit-Limit", String(limit));
      response.setHeader(
        "RateLimit-Remaining",
        String(Math.max(0, limit - count)),
      );

      if (count > limit) {
        response.status(429).json({
          error: "Too many realtime session requests.",
          code: "RATE_LIMITED",
        });
        return;
      }

      next();
    } catch (error) {
      console.error("Redis rate limiter failed:", error);
      response.status(503).json({
        error: "Session protection unavailable.",
      });
    }
  };
}
```

## `apps/api/src/realtime/realtime.provider.ts`

```ts
import { createHash } from "node:crypto";

import type {
  DecodedAssistantProfile,
} from "../profile/profile-metric.js";

export function createOpenAIRealtimeProvider(apiKey: string) {
  return {
    async createCall(request: {
      readonly sdp: string;
      readonly userId: string;
      readonly profile: DecodedAssistantProfile;
    }): Promise<string> {
      const session = {
        type: "realtime",
        model: "gpt-realtime-2.1",
        output_modalities: ["audio"],
        instructions: `
You are Eleanor, a realtime personal AI assistant.
Personality: ${request.profile.personality}.
Verbosity: ${request.profile.verbosity}.
Formality: ${request.profile.formality}.
Initiative: ${request.profile.initiative}.
Humor: ${request.profile.humor}/3.
Speak naturally, handle interruption gracefully, and never claim an external action
succeeded unless a trusted tool confirms it.
`.trim(),
        max_output_tokens:
          request.profile.verbosity === "brief"
            ? 220
            : request.profile.verbosity === "detailed"
              ? 1400
              : 600,
        reasoning: { effort: "low" },
        audio: {
          input: {
            noise_reduction: { type: "near_field" },
            turn_detection: {
              type: "semantic_vad",
              eagerness:
                request.profile.turnTaking === "patient"
                  ? "low"
                  : request.profile.turnTaking === "quick"
                    ? "high"
                    : "medium",
              create_response: true,
              interrupt_response: true,
            },
          },
          output: {
            voice: request.profile.voice,
            speed: request.profile.speechSpeed,
          },
        },
      };

      const form = new FormData();
      form.set("sdp", request.sdp);
      form.set("session", JSON.stringify(session));

      const upstream = await fetch(
        "https://api.openai.com/v1/realtime/calls",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "OpenAI-Safety-Identifier": createHash("sha256")
              .update(request.userId)
              .digest("hex"),
          },
          body: form,
          signal: AbortSignal.timeout(20_000),
        },
      );

      const answer = await upstream.text();

      if (!upstream.ok || !answer.trim().startsWith("v=0")) {
        throw new Error(
          `Realtime provider rejected session (${upstream.status}).`,
        );
      }

      return answer;
    },
  };
}
```

## `apps/api/src/realtime/realtime.routes.ts`

```ts
import { Router } from "express";
import type { RequestHandler } from "express";

import {
  requireAuthentication,
  requireCsrf,
} from "../auth/auth.middleware.js";
import { CredentialService } from "../credentials/credential.service.js";
import {
  DEFAULT_PROFILE_METRIC,
  decodeProfileMetric,
} from "../profile/profile-metric.js";
import type { AssistantProfileRepository } from "../profile/profile.repository.js";
import { createOpenAIRealtimeProvider } from "./realtime.provider.js";

export function createRealtimeRouter(
  profiles: AssistantProfileRepository,
  credentials: CredentialService,
  rateLimit: RequestHandler,
): Router {
  const router = Router();

  router.post(
    "/session",
    requireAuthentication(),
    requireCsrf(),
    rateLimit,
    async (request, response) => {
      if (
        typeof request.body !== "string" ||
        !request.body.trim().startsWith("v=0")
      ) {
        response.status(400).json({
          error: "A valid SDP offer is required.",
        });
        return;
      }

      const userId = request.eleanorSession!.data.user!.id;
      const credential =
        await credentials.getProviderSecret(userId);

      if (!credential) {
        response.status(409).json({
          error: "Configure an API provider before activating Eleanor.",
          code: "PROVIDER_CREDENTIAL_REQUIRED",
        });
        return;
      }

      try {
        const requestedMetric =
          request.header("x-eleanor-profile-metric");

        const stored = requestedMetric
          ? null
          : await profiles.find(userId);

        const profile = decodeProfileMetric(
          requestedMetric ??
          stored?.metric ??
          DEFAULT_PROFILE_METRIC,
        );

        const provider =
          createOpenAIRealtimeProvider(credential.apiKey);

        response
          .set("Cache-Control", "no-store")
          .type("application/sdp")
          .send(
            await provider.createCall({
              sdp: request.body,
              userId,
              profile,
            }),
          );
      } catch (error) {
        console.error("Realtime bootstrap failed:", error);

        response.status(502).json({
          error: "Unable to establish the realtime session.",
          code: "REALTIME_BOOTSTRAP_FAILED",
        });
      }
    },
  );

  return router;
}
```

## `apps/api/src/redis.ts`

```ts
import { createClient } from "redis";

export type RedisClient = ReturnType<typeof createClient>;

export async function createRedis(redisUrl: string): Promise<RedisClient> {
  const redis = createClient({
    url: redisUrl,
    socket: {
      reconnectStrategy(retries) {
        return Math.min(100 * 2 ** retries, 5_000);
      }
    }
  });

  redis.on("error", (error) => {
    console.error("Redis error:", error);
  });

  await redis.connect();
  return redis;
}
```

## `apps/api/src/server.ts`

```ts
import "dotenv/config";

import express from "express";
import helmet from "helmet";

import { attachSession } from "./auth/auth.middleware.js";
import { createAuthRouter } from "./auth/auth.routes.js";
import { OidcService } from "./auth/oidc.service.js";
import { SessionService } from "./auth/session.service.js";
import { loadConfig } from "./config.js";
import { CredentialCryptoService } from "./credentials/credential-crypto.service.js";
import { createCredentialRepository } from "./credentials/credential.repository.js";
import { createCredentialRouter } from "./credentials/credential.routes.js";
import { CredentialService } from "./credentials/credential.service.js";
import { createDatabase } from "./database.js";
import { createPasskeyRepository } from "./passkeys/passkey.repository.js";
import { createPasskeyRouter } from "./passkeys/passkey.routes.js";
import { PasskeyService } from "./passkeys/passkey.service.js";
import { createAssistantProfileRepository } from "./profile/profile.repository.js";
import { createProfileRouter } from "./profile/profile.routes.js";
import { createRedisRateLimitMiddleware } from "./rate-limit/redis-rate-limit.middleware.js";
import { createRealtimeRouter } from "./realtime/realtime.routes.js";
import { createRedis } from "./redis.js";

const config = loadConfig();
const database = createDatabase(config.databaseUrl);
const redis = await createRedis(config.redisUrl);

const sessions = new SessionService(redis, {
  production: config.production,
  ttlSeconds: config.sessionTtlSeconds,
});

const oidc = await OidcService.create({
  issuer: config.oidcIssuer,
  clientId: config.oidcClientId,
  clientSecret: config.oidcClientSecret,
  publicOrigin: config.publicOrigin,
});

const profiles =
  createAssistantProfileRepository(database);

const credentials = new CredentialService(
  createCredentialRepository(database),
  new CredentialCryptoService(
    config.credentialEncryptionKey,
  ),
);

const passkeys = new PasskeyService(
  createPasskeyRepository(database),
  sessions,
  {
    rpId: config.webauthnRpId,
    rpName: config.webauthnRpName,
    expectedOrigin: config.publicOrigin,
    enrollmentMaxOidcAgeSeconds:
      config.passkeyEnrollmentMaxOidcAgeSeconds,
  },
);

const realtimeRateLimit =
  createRedisRateLimitMiddleware(
    redis,
    config.realtimeSessionRateLimitPerMinute,
  );

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
  }),
);

app.use(express.json({ limit: "64kb" }));
app.use(
  express.text({
    type: ["application/sdp"],
    limit: "128kb",
  }),
);
app.use(attachSession(sessions));

app.get("/api/health", async (_request, response) => {
  try {
    await Promise.all([
      database.query("SELECT 1"),
      redis.ping(),
    ]);

    response.json({
      status: "ok",
      database: "ok",
      redis: "ok",
    });
  } catch {
    response.status(503).json({
      status: "degraded",
    });
  }
});

app.use(
  "/api/auth",
  createAuthRouter(
    sessions,
    oidc,
    config.publicOrigin,
  ),
);

app.use(
  "/api/passkeys",
  createPasskeyRouter(passkeys),
);

app.use(
  "/api/provider-credentials",
  createCredentialRouter(
    credentials,
    config.stepUpTtlSeconds,
  ),
);

app.use(
  "/api/assistant-profile",
  createProfileRouter(profiles),
);

app.use(
  "/api/realtime",
  createRealtimeRouter(
    profiles,
    credentials,
    realtimeRateLimit,
  ),
);

app.use((_request, response) => {
  response.status(404).json({
    error: "Route not found.",
  });
});

app.use(
  (
    error: unknown,
    _request: express.Request,
    response: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("Unhandled Eleanor API error:", error);
    response.status(500).json({
      error: "Internal server error.",
    });
  },
);

const server = app.listen(config.port, () => {
  console.log(`Eleanor API listening on ${config.port}`);
});

async function shutdown(): Promise<void> {
  server.close();
  await Promise.allSettled([
    database.end(),
    redis.quit(),
  ]);
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
```

## `apps/api/src/types/express.d.ts`

```ts
import type { SessionContext } from "../auth/session.types.js";

declare global {
  namespace Express {
    interface Request {
      eleanorSession?: SessionContext;
    }
  }
}

export {};
```

## `apps/api/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "src/**/*.d.ts"]
}
```

## `apps/api/vitest.config.ts`

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    clearMocks: true,
    restoreMocks: true
  }
});
```

## `apps/web/.postcssrc.json`

```json
{
  "plugins": {
    "@tailwindcss/postcss": {}
  }
}
```

## `apps/web/angular.json`

```json
{
  "$schema": "../../node_modules/@angular/cli/lib/config/schema.json",
  "version": 1,
  "projects": {
    "eleanor": {
      "projectType": "application",
      "root": "",
      "sourceRoot": "src",
      "prefix": "app",
      "architect": {
        "build": {
          "builder": "@angular/build:application",
          "options": {
            "browser": "src/main.ts",
            "tsConfig": "tsconfig.app.json",
            "styles": ["src/styles.css"]
          },
          "configurations": {
            "production": {
              "optimization": true,
              "outputHashing": "all",
              "sourceMap": false
            },
            "development": {
              "optimization": false,
              "sourceMap": true
            }
          },
          "defaultConfiguration": "production"
        },
        "serve": {
          "builder": "@angular/build:dev-server",
          "configurations": {
            "development": {
              "buildTarget": "eleanor:build:development"
            }
          },
          "defaultConfiguration": "development"
        }
      }
    }
  }
}
```

## `apps/web/package.json`

```json
{
  "name": "@eleanor/web",
  "version": "0.7.0",
  "private": true,
  "scripts": {
    "start": "ng serve --proxy-config proxy.conf.json",
    "build": "ng build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@angular/common": "~20.3.0",
    "@angular/compiler": "~20.3.0",
    "@angular/core": "~20.3.0",
    "@angular/platform-browser": "~20.3.0",
    "@angular/router": "~20.3.0",
    "@simplewebauthn/browser": "^14.0.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@angular/build": "~20.3.0",
    "@angular/cli": "~20.3.0",
    "@angular/compiler-cli": "~20.3.0",
    "@tailwindcss/postcss": "^4.1.0",
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "jsdom": "^26.1.0",
    "postcss": "^8.5.0",
    "tailwindcss": "^4.1.0",
    "typescript": "~5.8.3",
    "vitest": "^3.2.0"
  }
}
```

## `apps/web/proxy.conf.json`

```json
{
  "/api": {
    "target": "http://localhost:3000",
    "secure": false,
    "changeOrigin": true
  }
}
```

## `apps/web/src/app/app.component.ts`

```ts
import { ChangeDetectionStrategy, Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet />`,
})
export class AppComponent {}
```

## `apps/web/src/app/app.routes.ts`

```ts
import type { Routes } from "@angular/router";

import { authGuard } from "./core/auth/auth.guard";
import { AssistantPageComponent } from "./features/assistant/assistant-page.component";
import { LoginPageComponent } from "./features/auth/login-page.component";
import { SecurityPageComponent } from "./features/security/security-page.component";
import { SettingsPageComponent } from "./features/settings/settings-page.component";

export const routes: Routes = [
  {
    path: "",
    pathMatch: "full",
    redirectTo: "assistant",
  },
  {
    path: "login",
    component: LoginPageComponent,
    title: "Sign in · Eleanor",
  },
  {
    path: "assistant",
    component: AssistantPageComponent,
    canActivate: [authGuard],
    title: "Eleanor",
  },
  {
    path: "settings",
    component: SettingsPageComponent,
    canActivate: [authGuard],
    title: "Settings · Eleanor",
  },
  {
    path: "security",
    component: SecurityPageComponent,
    canActivate: [authGuard],
    title: "Security · Eleanor",
  },
  {
    path: "**",
    redirectTo: "assistant",
  },
];
```

## `apps/web/src/app/core/audio/audio-levels.service.ts`

```ts
import { Injectable, signal } from "@angular/core";

@Injectable({
  providedIn: "root",
})
export class AudioLevelsService {
  readonly inputLevel = signal(0);
  readonly outputLevel = signal(0);

  private context: AudioContext | null = null;
  private frame: number | null = null;
  private inputAnalyser: AnalyserNode | null = null;
  private outputAnalyser: AnalyserNode | null = null;
  private inputSamples: Float32Array<ArrayBuffer> | null = null;
  private outputSamples: Float32Array<ArrayBuffer> | null = null;
  private sources: MediaStreamAudioSourceNode[] = [];

  async attachInput(stream: MediaStream): Promise<void> {
    const context = await this.ensureContext();
    const source = context.createMediaStreamSource(stream);
    const analyser = this.createAnalyser(context);

    source.connect(analyser);
    this.sources.push(source);
    this.inputAnalyser = analyser;
    this.inputSamples = new Float32Array(analyser.fftSize);
    this.startSampling();
  }

  async attachOutput(stream: MediaStream): Promise<void> {
    const context = await this.ensureContext();
    const source = context.createMediaStreamSource(stream);
    const analyser = this.createAnalyser(context);

    source.connect(analyser);
    this.sources.push(source);
    this.outputAnalyser = analyser;
    this.outputSamples = new Float32Array(analyser.fftSize);
    this.startSampling();
  }

  async resume(): Promise<void> {
    if (this.context?.state === "suspended") {
      await this.context.resume();
    }
  }

  stop(): void {
    if (this.frame !== null) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }

    for (const source of this.sources) {
      source.disconnect();
    }

    this.sources = [];
    this.inputAnalyser = null;
    this.outputAnalyser = null;
    this.inputSamples = null;
    this.outputSamples = null;
    this.inputLevel.set(0);
    this.outputLevel.set(0);

    const context = this.context;
    this.context = null;

    if (context && context.state !== "closed") {
      void context.close();
    }
  }

  private async ensureContext(): Promise<AudioContext> {
    this.context ??= new AudioContext({
      latencyHint: "interactive",
    });

    if (this.context.state === "suspended") {
      await this.context.resume();
    }

    return this.context;
  }

  private createAnalyser(context: AudioContext): AnalyserNode {
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.82;
    return analyser;
  }

  private startSampling(): void {
    if (this.frame !== null) {
      return;
    }

    const sample = () => {
      this.inputLevel.set(
        this.readLevel(this.inputAnalyser, this.inputSamples),
      );
      this.outputLevel.set(
        this.readLevel(this.outputAnalyser, this.outputSamples),
      );
      this.frame = requestAnimationFrame(sample);
    };

    this.frame = requestAnimationFrame(sample);
  }

  private readLevel(
    analyser: AnalyserNode | null,
    samples: Float32Array<ArrayBuffer> | null,
  ): number {
    if (!analyser || !samples) {
      return 0;
    }

    analyser.getFloatTimeDomainData(samples);

    let squareSum = 0;

    for (const sample of samples) {
      squareSum += sample * sample;
    }

    const rms = Math.sqrt(squareSum / samples.length);

    if (rms <= 0.00001) {
      return 0;
    }

    const decibels = 20 * Math.log10(rms);

    return Math.min(
      1,
      Math.max(0, (decibels + 60) / 52),
    );
  }
}
```

## `apps/web/src/app/core/auth/auth.guard.ts`

```ts
import { inject } from "@angular/core";
import type { CanActivateFn } from "@angular/router";
import { Router } from "@angular/router";

import { AuthService } from "./auth.service";

export const authGuard: CanActivateFn = async (
  _route,
  state,
) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.ensureLoaded();

  return auth.authenticated()
    ? true
    : router.createUrlTree(
        ["/login"],
        {
          queryParams: {
            returnUrl: state.url,
          },
        },
      );
};
```

## `apps/web/src/app/core/auth/auth.service.ts`

```ts
import { Injectable, computed, signal } from "@angular/core";

export interface EleanorUser {
  readonly id: string;
  readonly name?: string;
  readonly email?: string;
  readonly picture?: string;
}

@Injectable({
  providedIn: "root",
})
export class AuthService {
  readonly state = signal<
    "loading" | "anonymous" | "authenticated"
  >("loading");

  readonly user = signal<EleanorUser | null>(null);

  readonly authenticated = computed(
    () => this.state() === "authenticated",
  );

  private readonly csrfToken = signal<string | null>(null);
  private loadingPromise: Promise<void> | null = null;

  ensureLoaded(): Promise<void> {
    if (this.state() !== "loading") {
      return Promise.resolve();
    }

    this.loadingPromise ??= this.load();
    return this.loadingPromise;
  }

  login(returnTo = "/assistant"): void {
    window.location.assign(
      `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`,
    );
  }

  async logout(): Promise<void> {
    const response = await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: this.csrfHeaders(),
    });

    if (!response.ok) {
      throw new Error("Unable to sign out.");
    }

    const payload = (await response.json()) as {
      readonly logoutUrl: string;
    };

    this.user.set(null);
    this.csrfToken.set(null);
    this.state.set("anonymous");
    window.location.assign(payload.logoutUrl);
  }

  csrfHeaders(): Record<string, string> {
    const token = this.csrfToken();

    if (!token) {
      throw new Error("CSRF token is unavailable.");
    }

    return {
      "X-CSRF-Token": token,
    };
  }

  private async load(): Promise<void> {
    try {
      const response = await fetch("/api/auth/session", {
        credentials: "include",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(
          `Unable to load auth state (${response.status}).`,
        );
      }

      const session = (await response.json()) as {
        readonly authenticated: boolean;
        readonly user: EleanorUser | null;
        readonly csrfToken: string;
      };

      this.user.set(session.user);
      this.csrfToken.set(session.csrfToken);
      this.state.set(
        session.authenticated
          ? "authenticated"
          : "anonymous",
      );
    } catch (error) {
      console.error("Authentication bootstrap failed:", error);
      this.state.set("anonymous");
    }
  }
}
```

## `apps/web/src/app/core/credentials/provider-credential.service.ts`

```ts
import { Injectable, signal } from "@angular/core";

import { AuthService } from "../auth/auth.service";
import { PasskeyService } from "../passkeys/passkey.service";

export type AiProvider = "openai";

export interface ProviderCredentialDetails {
  readonly provider: AiProvider;
  readonly maskedApiKey: string;
  readonly updatedAt: string;
}

@Injectable({
  providedIn: "root",
})
export class ProviderCredentialService {
  readonly loading = signal(true);
  readonly configured = signal(false);
  readonly provider = signal<AiProvider | null>(null);

  constructor(
    private readonly auth: AuthService,
    private readonly passkeys: PasskeyService,
  ) {}

  async loadStatus(): Promise<void> {
    this.loading.set(true);

    try {
      const response = await fetch(
        "/api/provider-credentials/status",
        {
          credentials: "include",
          cache: "no-store",
        },
      );

      if (!response.ok) {
        throw new Error(
          `Unable to load provider status (${response.status}).`,
        );
      }

      const status = (await response.json()) as {
        readonly configured: boolean;
        readonly provider: AiProvider | null;
      };

      this.configured.set(status.configured);
      this.provider.set(status.provider);
    } finally {
      this.loading.set(false);
    }
  }

  async details(): Promise<ProviderCredentialDetails | null> {
    await this.passkeys.ensureStepUp();

    const response = await fetch(
      "/api/provider-credentials/details",
      {
        credentials: "include",
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(
        `Unable to load provider details (${response.status}).`,
      );
    }

    const payload = (await response.json()) as {
      readonly credential: ProviderCredentialDetails | null;
    };

    return payload.credential;
  }

  async save(
    provider: AiProvider,
    apiKey: string,
  ): Promise<void> {
    await this.passkeys.ensureStepUp();

    const response = await fetch(
      "/api/provider-credentials",
      {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...this.auth.csrfHeaders(),
        },
        body: JSON.stringify({
          provider,
          apiKey,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(
        `Unable to save provider credential (${response.status}).`,
      );
    }

    this.provider.set(provider);
    this.configured.set(true);
  }

  async remove(): Promise<void> {
    await this.passkeys.ensureStepUp();

    const response = await fetch(
      "/api/provider-credentials",
      {
        method: "DELETE",
        credentials: "include",
        headers: this.auth.csrfHeaders(),
      },
    );

    if (!response.ok) {
      throw new Error(
        `Unable to remove provider credential (${response.status}).`,
      );
    }

    this.provider.set(null);
    this.configured.set(false);
  }
}
```

## `apps/web/src/app/core/passkeys/passkey.service.ts`

```ts
import { Injectable, signal } from "@angular/core";

import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";

import { AuthService } from "../auth/auth.service";

@Injectable({
  providedIn: "root",
})
export class PasskeyService {
  readonly supported = signal(browserSupportsWebAuthn());
  readonly loading = signal(true);
  readonly registered = signal(false);
  readonly count = signal(0);
  readonly stepUpVerifiedAt = signal<number | null>(null);

  constructor(
    private readonly auth: AuthService,
  ) {}

  async load(): Promise<void> {
    this.loading.set(true);

    try {
      const response = await fetch("/api/passkeys/status", {
        credentials: "include",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(
          `Unable to load passkey status (${response.status}).`,
        );
      }

      const status = (await response.json()) as {
        readonly registered: boolean;
        readonly count: number;
        readonly stepUpVerifiedAt: number | null;
      };

      this.registered.set(status.registered);
      this.count.set(status.count);
      this.stepUpVerifiedAt.set(status.stepUpVerifiedAt);
    } finally {
      this.loading.set(false);
    }
  }

  async register(): Promise<void> {
    this.assertSupported();

    const options = await this.options<
      PublicKeyCredentialCreationOptionsJSON
    >("/api/passkeys/registration/options");

    const browserResponse = await startRegistration({
      optionsJSON: options,
    });

    const verification = await fetch(
      "/api/passkeys/registration/verify",
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...this.auth.csrfHeaders(),
        },
        body: JSON.stringify(browserResponse),
      },
    );

    if (!verification.ok) {
      throw await this.errorFrom(
        verification,
        "Passkey registration failed.",
      );
    }

    const result = (await verification.json()) as {
      readonly verified: boolean;
      readonly stepUpVerifiedAt: number;
    };

    if (!result.verified) {
      throw new Error("Passkey registration was not verified.");
    }

    this.registered.set(true);
    this.count.update((value) => value + 1);
    this.stepUpVerifiedAt.set(result.stepUpVerifiedAt);
  }

  async stepUp(): Promise<void> {
    this.assertSupported();

    const options = await this.options<
      PublicKeyCredentialRequestOptionsJSON
    >("/api/passkeys/step-up/options");

    const browserResponse = await startAuthentication({
      optionsJSON: options,
    });

    const verification = await fetch(
      "/api/passkeys/step-up/verify",
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...this.auth.csrfHeaders(),
        },
        body: JSON.stringify(browserResponse),
      },
    );

    if (!verification.ok) {
      throw await this.errorFrom(
        verification,
        "Passkey verification failed.",
      );
    }

    const result = (await verification.json()) as {
      readonly verified: boolean;
      readonly stepUpVerifiedAt: number;
    };

    if (!result.verified) {
      throw new Error("Passkey verification failed.");
    }

    this.stepUpVerifiedAt.set(result.stepUpVerifiedAt);
  }

  async ensureStepUp(maxAgeSeconds = 300): Promise<void> {
    const verifiedAt = this.stepUpVerifiedAt();

    if (
      verifiedAt &&
      Date.now() - verifiedAt <= maxAgeSeconds * 1_000
    ) {
      return;
    }

    await this.stepUp();
  }

  private async options<T>(url: string): Promise<T> {
    const response = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: this.auth.csrfHeaders(),
    });

    if (!response.ok) {
      throw await this.errorFrom(
        response,
        "Unable to start passkey ceremony.",
      );
    }

    return (await response.json()) as T;
  }

  private async errorFrom(
    response: Response,
    fallback: string,
  ): Promise<Error> {
    const payload = await response
      .json()
      .catch(() => null) as {
        readonly error?: string;
      } | null;

    return new Error(payload?.error ?? fallback);
  }

  private assertSupported(): void {
    if (!this.supported()) {
      throw new Error(
        "This browser does not support WebAuthn/passkeys.",
      );
    }
  }
}
```

## `apps/web/src/app/core/realtime/realtime-voice.service.ts`

```ts
import {
  Injectable,
  effect,
  signal,
} from "@angular/core";

import { AudioLevelsService } from "../audio/audio-levels.service";
import { AuthService } from "../auth/auth.service";
import { ProviderCredentialService } from "../credentials/provider-credential.service";
import { AssistantSettingsService } from "../settings/assistant-settings.service";
import type {
  RealtimeServerEvent,
  RealtimeSessionUpdateEvent,
  VoiceConnectionState,
} from "./realtime.types";

@Injectable({
  providedIn: "root",
})
export class RealtimeVoiceService {
  readonly state =
    signal<VoiceConnectionState>("offline");

  readonly message =
    signal("Activate Eleanor to begin.");

  readonly connected = signal(false);
  readonly voiceLocked = signal(false);
  readonly settingsPending = signal(false);
  readonly inputLevel = this.audioLevels.inputLevel;
  readonly outputLevel = this.audioLevels.outputLevel;

  private peerConnection:
    RTCPeerConnection | null = null;

  private dataChannel:
    RTCDataChannel | null = null;

  private microphoneStream:
    MediaStream | null = null;

  private remoteAudio:
    HTMLAudioElement | null = null;

  constructor(
    private readonly settings: AssistantSettingsService,
    private readonly audioLevels: AudioLevelsService,
    private readonly auth: AuthService,
    private readonly credentials: ProviderCredentialService,
  ) {
    effect(() => {
      this.settings.settings();
      this.settings.instructions();
      this.settings.maxOutputTokens();
      this.settings.vadEagerness();

      if (!this.connected()) {
        return;
      }

      if (this.state() === "speaking") {
        this.settingsPending.set(true);
        return;
      }

      this.applySettingsToSession();
    });
  }

  async connect(): Promise<void> {
    await this.auth.ensureLoaded();

    if (!this.auth.authenticated()) {
      throw new Error(
        "Sign in before activating Eleanor.",
      );
    }

    if (!this.credentials.configured()) {
      throw new Error(
        "Configure an API provider before activating Eleanor.",
      );
    }

    if (
      this.state() !== "offline" &&
      this.state() !== "error"
    ) {
      return;
    }

    this.state.set("connecting");
    this.message.set("Requesting microphone access…");
    this.voiceLocked.set(false);

    try {
      const microphone =
        await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

      this.microphoneStream = microphone;
      await this.audioLevels.attachInput(microphone);

      const peer = new RTCPeerConnection();
      this.peerConnection = peer;

      this.configureRemoteAudio(peer);
      this.configureDataChannel(peer);
      this.configureConnection(peer);

      for (const track of microphone.getAudioTracks()) {
        peer.addTrack(track, microphone);
      }

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      if (!offer.sdp) {
        throw new Error(
          "Browser did not create an SDP offer.",
        );
      }

      const response = await fetch(
        "/api/realtime/session",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/sdp",
            "X-Eleanor-Profile-Metric": String(
              this.settings.profileMetric(),
            ),
            ...this.auth.csrfHeaders(),
          },
          body: offer.sdp,
        },
      );

      if (!response.ok) {
        const payload = await response
          .json()
          .catch(() => null) as {
            readonly error?: string;
          } | null;

        throw new Error(
          payload?.error ??
          `Realtime bootstrap failed (${response.status}).`,
        );
      }

      await peer.setRemoteDescription({
        type: "answer",
        sdp: await response.text(),
      });
    } catch (error) {
      this.releaseResources();
      this.state.set("error");
      this.message.set(
        error instanceof Error
          ? error.message
          : "Unable to activate Eleanor.",
      );
      throw error;
    }
  }

  disconnect(): void {
    this.releaseResources();
    this.connected.set(false);
    this.voiceLocked.set(false);
    this.state.set("offline");
    this.message.set("Activate Eleanor to begin.");
  }

  applySettingsToSession(): void {
    if (
      !this.connected() ||
      !this.dataChannel ||
      this.dataChannel.readyState !== "open"
    ) {
      return;
    }

    const current = this.settings.settings();

    const event: RealtimeSessionUpdateEvent = {
      type: "session.update",
      session: {
        type: "realtime",
        instructions: this.settings.instructions(),
        max_output_tokens:
          this.settings.maxOutputTokens(),
        audio: {
          input: {
            turn_detection: {
              type: "semantic_vad",
              eagerness: this.settings.vadEagerness(),
              create_response: true,
              interrupt_response: true,
            },
          },
          output: {
            speed: current.speechSpeed,
            ...(this.voiceLocked()
              ? {}
              : { voice: current.voice }),
          },
        },
      },
    };

    this.dataChannel.send(JSON.stringify(event));
    this.settingsPending.set(false);
  }

  private configureRemoteAudio(
    peer: RTCPeerConnection,
  ): void {
    const audio = new Audio();
    audio.autoplay = true;

    peer.addEventListener("track", (event) => {
      const stream =
        event.streams[0] ??
        new MediaStream([event.track]);

      audio.srcObject = stream;
      void this.audioLevels.attachOutput(stream);
    });

    this.remoteAudio = audio;
  }

  private configureDataChannel(
    peer: RTCPeerConnection,
  ): void {
    const channel =
      peer.createDataChannel("oai-events");

    channel.addEventListener("open", () => {
      void this.audioLevels.resume();
      this.applySettingsToSession();
    });

    channel.addEventListener(
      "message",
      (event: MessageEvent<string>) => {
        this.handleRealtimeMessage(event.data);
      },
    );

    this.dataChannel = channel;
  }

  private configureConnection(
    peer: RTCPeerConnection,
  ): void {
    peer.addEventListener(
      "connectionstatechange",
      () => {
        if (peer.connectionState === "connected") {
          this.connected.set(true);
          this.state.set("listening");
          this.message.set("I'm listening.");
        } else if (
          peer.connectionState === "failed"
        ) {
          this.connected.set(false);
          this.state.set("error");
          this.message.set(
            "Realtime connection failed.",
          );
        }
      },
    );
  }

  private handleRealtimeMessage(raw: string): void {
    let event: RealtimeServerEvent;

    try {
      event = JSON.parse(raw) as RealtimeServerEvent;
    } catch {
      return;
    }

    switch (event.type) {
      case "input_audio_buffer.speech_started":
        this.state.set("listening");
        this.message.set("Listening…");
        break;

      case "input_audio_buffer.speech_stopped":
        this.state.set("thinking");
        this.message.set("Thinking…");
        break;

      case "response.created":
        this.voiceLocked.set(true);
        this.state.set("speaking");
        this.message.set("Responding…");
        break;

      case "response.done":
        this.state.set("listening");
        this.message.set("I'm listening.");

        if (this.settingsPending()) {
          this.applySettingsToSession();
        }
        break;

      case "session.updated":
        this.settingsPending.set(false);
        break;

      case "error":
        this.state.set("error");
        this.message.set(
          event.error?.message ??
          "Realtime API error.",
        );
        break;
    }
  }

  private releaseResources(): void {
    this.dataChannel?.close();
    this.peerConnection?.close();

    this.microphoneStream
      ?.getTracks()
      .forEach((track) => track.stop());

    if (this.remoteAudio) {
      this.remoteAudio.pause();
      this.remoteAudio.srcObject = null;
    }

    this.audioLevels.stop();
    this.dataChannel = null;
    this.peerConnection = null;
    this.microphoneStream = null;
    this.remoteAudio = null;
  }
}
```

## `apps/web/src/app/core/realtime/realtime.types.ts`

```ts
export type VoiceConnectionState =
  | "offline"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

export interface RealtimeServerEvent {
  readonly type: string;
  readonly error?: {
    readonly message?: string;
  };
}

export interface RealtimeSessionUpdateEvent {
  readonly type: "session.update";
  readonly session: {
    readonly type: "realtime";
    readonly instructions: string;
    readonly max_output_tokens: number;
    readonly audio: {
      readonly input: {
        readonly turn_detection: {
          readonly type: "semantic_vad";
          readonly eagerness: "low" | "medium" | "high";
          readonly create_response: true;
          readonly interrupt_response: true;
        };
      };
      readonly output: {
        readonly speed: number;
        readonly voice?: string;
      };
    };
  };
}
```

## `apps/web/src/app/core/settings/assistant-profile-api.service.ts`

```ts
import { Injectable } from "@angular/core";

import { AuthService } from "../auth/auth.service";

@Injectable({
  providedIn: "root",
})
export class AssistantProfileApiService {
  constructor(
    private readonly auth: AuthService,
  ) {}

  async load(): Promise<string | null> {
    const response = await fetch("/api/assistant-profile", {
      credentials: "include",
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `Unable to load profile (${response.status}).`,
      );
    }

    const payload = (await response.json()) as {
      readonly profile: {
        readonly metric: string;
      } | null;
    };

    return payload.profile?.metric ?? null;
  }

  async save(metric: number): Promise<void> {
    const response = await fetch("/api/assistant-profile", {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...this.auth.csrfHeaders(),
      },
      body: JSON.stringify({
        metric: String(metric),
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Unable to save profile (${response.status}).`,
      );
    }
  }
}
```

## `apps/web/src/app/core/settings/assistant-profile-metric.service.spec.ts`

```ts
import { describe, expect, it } from "vitest";

import { AssistantProfileMetricService } from "./assistant-profile-metric.service";
import type {
  AssistantSettings,
} from "./assistant-settings.types";

describe("AssistantProfileMetricService", () => {
  it(
    "exhaustively produces 155,520 unique reversible profiles",
    () => {
      const codec = new AssistantProfileMetricService();
      const metrics = new Set<number>();

      const personalities = [
        "professional",
        "warm",
        "witty",
        "direct",
      ] as const;

      const verbosities = [
        "brief",
        "balanced",
        "detailed",
      ] as const;

      const formalities = [
        "casual",
        "neutral",
        "formal",
      ] as const;

      const initiatives = [
        "reactive",
        "balanced",
        "proactive",
      ] as const;

      const turns = [
        "patient",
        "balanced",
        "quick",
      ] as const;

      const humors = [0, 1, 2, 3] as const;

      const speeds = [
        0.75,
        0.8,
        0.85,
        0.9,
        0.95,
        1,
        1.05,
        1.1,
        1.15,
        1.2,
        1.25,
        1.3,
      ] as const;

      const voices = [
        "alloy",
        "ash",
        "ballad",
        "coral",
        "echo",
        "sage",
        "shimmer",
        "verse",
        "marin",
        "cedar",
      ] as const;

      for (const personality of personalities)
        for (const verbosity of verbosities)
          for (const formality of formalities)
            for (const initiative of initiatives)
              for (const turnTaking of turns)
                for (const humor of humors)
                  for (const speechSpeed of speeds)
                    for (const voice of voices) {
                      const settings: AssistantSettings = {
                        personality,
                        verbosity,
                        formality,
                        initiative,
                        turnTaking,
                        humor,
                        speechSpeed,
                        voice,
                      };

                      const metric = codec.encode(settings);

                      expect(metrics.has(metric)).toBe(false);
                      metrics.add(metric);
                      expect(codec.decode(metric)).toEqual(settings);
                    }

      expect(metrics.size).toBe(155_520);
    },
  );
});
```

## `apps/web/src/app/core/settings/assistant-profile-metric.service.ts`

```ts
import { Injectable } from "@angular/core";

import type {
  AssistantSettings,
} from "./assistant-settings.types";

const PERSONALITIES = [
  "professional",
  "warm",
  "witty",
  "direct",
] as const;

const VERBOSITIES = [
  "brief",
  "balanced",
  "detailed",
] as const;

const FORMALITIES = [
  "casual",
  "neutral",
  "formal",
] as const;

const INITIATIVES = [
  "reactive",
  "balanced",
  "proactive",
] as const;

const TURNS = [
  "patient",
  "balanced",
  "quick",
] as const;

const HUMORS = [0, 1, 2, 3] as const;

const SPEEDS = [
  0.75,
  0.8,
  0.85,
  0.9,
  0.95,
  1,
  1.05,
  1.1,
  1.15,
  1.2,
  1.25,
  1.3,
] as const;

const VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
] as const;

const WEIGHTS = {
  personality: 1,
  verbosity: 4,
  formality: 12,
  initiative: 36,
  turnTaking: 108,
  humor: 324,
  speechSpeed: 1296,
  voice: 15552,
} as const;

@Injectable({
  providedIn: "root",
})
export class AssistantProfileMetricService {
  encode(settings: AssistantSettings): number {
    return (
      1_000_000 +
      this.index(PERSONALITIES, settings.personality) *
        WEIGHTS.personality +
      this.index(VERBOSITIES, settings.verbosity) *
        WEIGHTS.verbosity +
      this.index(FORMALITIES, settings.formality) *
        WEIGHTS.formality +
      this.index(INITIATIVES, settings.initiative) *
        WEIGHTS.initiative +
      this.index(TURNS, settings.turnTaking) *
        WEIGHTS.turnTaking +
      this.index(HUMORS, settings.humor) *
        WEIGHTS.humor +
      this.index(SPEEDS, settings.speechSpeed) *
        WEIGHTS.speechSpeed +
      this.index(VOICES, settings.voice) *
        WEIGHTS.voice
    );
  }

  decode(metric: number): AssistantSettings {
    if (
      !Number.isSafeInteger(metric) ||
      metric < 1_000_000 ||
      metric > 1_155_519
    ) {
      throw new Error("Invalid Eleanor profile metric.");
    }

    const payload = metric - 1_000_000;

    const digit = (
      weight: number,
      radix: number,
    ) => Math.floor(payload / weight) % radix;

    return {
      personality:
        PERSONALITIES[
          digit(WEIGHTS.personality, PERSONALITIES.length)
        ],
      verbosity:
        VERBOSITIES[
          digit(WEIGHTS.verbosity, VERBOSITIES.length)
        ],
      formality:
        FORMALITIES[
          digit(WEIGHTS.formality, FORMALITIES.length)
        ],
      initiative:
        INITIATIVES[
          digit(WEIGHTS.initiative, INITIATIVES.length)
        ],
      turnTaking:
        TURNS[
          digit(WEIGHTS.turnTaking, TURNS.length)
        ],
      humor:
        HUMORS[
          digit(WEIGHTS.humor, HUMORS.length)
        ],
      speechSpeed:
        SPEEDS[
          digit(WEIGHTS.speechSpeed, SPEEDS.length)
        ],
      voice:
        VOICES[
          digit(WEIGHTS.voice, VOICES.length)
        ],
    };
  }

  private index<
    TValue extends string | number,
  >(
    values: readonly TValue[],
    value: TValue,
  ): number {
    const index = values.indexOf(value);

    if (index < 0) {
      throw new Error(
        `Unsupported profile value: ${String(value)}.`,
      );
    }

    return index;
  }
}
```

## `apps/web/src/app/core/settings/assistant-settings.service.ts`

```ts
import {
  Injectable,
  computed,
  signal,
} from "@angular/core";

import { AssistantProfileApiService } from "./assistant-profile-api.service";
import { AssistantProfileMetricService } from "./assistant-profile-metric.service";
import type {
  AssistantFormality,
  AssistantInitiative,
  AssistantPersonality,
  AssistantSettings,
  AssistantTurnTaking,
  AssistantVerbosity,
  AssistantVoice,
} from "./assistant-settings.types";

const STORAGE_KEY =
  "eleanor.assistant-profile.metric";

const DEFAULTS: AssistantSettings = {
  personality: "professional",
  verbosity: "balanced",
  formality: "neutral",
  initiative: "balanced",
  turnTaking: "balanced",
  humor: 1,
  speechSpeed: 1,
  voice: "marin",
};

@Injectable({
  providedIn: "root",
})
export class AssistantSettingsService {
  readonly settings = signal<AssistantSettings>(
    this.loadLocal(),
  );

  readonly profileMetric = computed(
    () => this.codec.encode(this.settings()),
  );

  readonly instructions = computed(
    () => `
You are Eleanor, a realtime personal AI assistant.

Profile:
- Personality: ${this.settings().personality}
- Verbosity: ${this.settings().verbosity}
- Formality: ${this.settings().formality}
- Initiative: ${this.settings().initiative}
- Humor: ${this.settings().humor}/3

Speak naturally and conversationally.
Handle interruptions gracefully.
Never claim an external action succeeded unless a trusted tool confirms it.
`.trim(),
  );

  readonly maxOutputTokens = computed(() =>
    this.settings().verbosity === "brief"
      ? 220
      : this.settings().verbosity === "detailed"
        ? 1400
        : 600,
  );

  readonly vadEagerness = computed<
    "low" | "medium" | "high"
  >(() =>
    this.settings().turnTaking === "patient"
      ? "low"
      : this.settings().turnTaking === "quick"
        ? "high"
        : "medium",
  );

  private saveTimer:
    ReturnType<typeof setTimeout> | null =
    null;

  constructor(
    private readonly codec: AssistantProfileMetricService,
    private readonly api: AssistantProfileApiService,
  ) {}

  async hydrateFromAccount(): Promise<void> {
    const remoteMetric = await this.api.load();

    if (remoteMetric) {
      this.set(
        this.codec.decode(Number(remoteMetric)),
        false,
      );
      return;
    }

    await this.api.save(this.profileMetric());
  }

  updatePersonality(
    value: AssistantPersonality,
  ): void {
    this.patch({ personality: value });
  }

  updateVerbosity(
    value: AssistantVerbosity,
  ): void {
    this.patch({ verbosity: value });
  }

  updateFormality(
    value: AssistantFormality,
  ): void {
    this.patch({ formality: value });
  }

  updateInitiative(
    value: AssistantInitiative,
  ): void {
    this.patch({ initiative: value });
  }

  updateTurnTaking(
    value: AssistantTurnTaking,
  ): void {
    this.patch({ turnTaking: value });
  }

  updateVoice(
    value: AssistantVoice,
  ): void {
    this.patch({ voice: value });
  }

  updateHumor(value: number): void {
    this.patch({
      humor: Math.max(
        0,
        Math.min(3, Math.round(value)),
      ),
    });
  }

  updateSpeechSpeed(value: number): void {
    const clamped = Math.max(
      0.75,
      Math.min(1.3, value),
    );

    this.patch({
      speechSpeed: Number(
        (
          Math.round((clamped - 0.75) / 0.05) *
            0.05 +
          0.75
        ).toFixed(2),
      ),
    });
  }

  reset(): void {
    this.set(DEFAULTS, true);
  }

  private patch(
    changes: Partial<AssistantSettings>,
  ): void {
    this.set(
      {
        ...this.settings(),
        ...changes,
      },
      true,
    );
  }

  private set(
    settings: AssistantSettings,
    sync: boolean,
  ): void {
    this.settings.set(settings);

    const metric = this.codec.encode(settings);

    if (typeof localStorage !== "undefined") {
      localStorage.setItem(
        STORAGE_KEY,
        String(metric),
      );
    }

    if (!sync) {
      return;
    }

    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    this.saveTimer = setTimeout(() => {
      void this.api.save(metric);
    }, 450);
  }

  private loadLocal(): AssistantSettings {
    if (typeof localStorage === "undefined") {
      return DEFAULTS;
    }

    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return DEFAULTS;
    }

    try {
      return this.codec.decode(Number(raw));
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return DEFAULTS;
    }
  }
}
```

## `apps/web/src/app/core/settings/assistant-settings.types.ts`

```ts
export type AssistantPersonality =
  | "professional"
  | "warm"
  | "witty"
  | "direct";

export type AssistantVerbosity =
  | "brief"
  | "balanced"
  | "detailed";

export type AssistantFormality =
  | "casual"
  | "neutral"
  | "formal";

export type AssistantInitiative =
  | "reactive"
  | "balanced"
  | "proactive";

export type AssistantTurnTaking =
  | "patient"
  | "balanced"
  | "quick";

export type AssistantVoice =
  | "alloy"
  | "ash"
  | "ballad"
  | "coral"
  | "echo"
  | "sage"
  | "shimmer"
  | "verse"
  | "marin"
  | "cedar";

export interface AssistantSettings {
  readonly personality: AssistantPersonality;
  readonly verbosity: AssistantVerbosity;
  readonly formality: AssistantFormality;
  readonly initiative: AssistantInitiative;
  readonly turnTaking: AssistantTurnTaking;
  readonly humor: number;
  readonly speechSpeed: number;
  readonly voice: AssistantVoice;
}
```

## `apps/web/src/app/features/assistant/assistant-page.component.ts`

```ts
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  ViewChild,
  computed,
  signal,
} from "@angular/core";
import { RouterLink } from "@angular/router";

import { AuthService } from "../../core/auth/auth.service";
import type {
  AiProvider,
} from "../../core/credentials/provider-credential.service";
import {
  ProviderCredentialService,
} from "../../core/credentials/provider-credential.service";
import { PasskeyService } from "../../core/passkeys/passkey.service";
import {
  RealtimeVoiceService,
} from "../../core/realtime/realtime-voice.service";
import {
  AssistantSettingsService,
} from "../../core/settings/assistant-settings.service";
import {
  PasskeySetupDialogComponent,
} from "./passkey-setup-dialog.component";
import {
  ProviderCredentialDialogComponent,
} from "./provider-credential-dialog.component";
import {
  VoiceOrbIslandComponent,
} from "./voice-orb-island.component";

@Component({
  selector: "app-assistant-page",
  standalone: true,
  imports: [
    RouterLink,
    VoiceOrbIslandComponent,
    PasskeySetupDialogComponent,
    ProviderCredentialDialogComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main
      class="
        relative grid min-h-screen place-items-center
        overflow-hidden bg-space-975 px-6 text-white
      "
    >
      <nav
        class="
          absolute left-6 right-6 top-6 z-20
          flex items-center justify-between
        "
      >
        <strong class="text-xs tracking-[0.3em]">
          ELEANOR
        </strong>

        <div class="flex gap-3">
          <a
            routerLink="/settings"
            class="eleanor-button"
          >
            Settings
          </a>

          <button
            type="button"
            class="eleanor-button"
            (click)="logout()"
          >
            Sign out
          </button>
        </div>
      </nav>

      <section
        class="
          relative z-10 flex flex-col
          items-center gap-8 text-center
        "
      >
        <app-voice-orb-island
          [state]="voice.state()"
          [inputLevel]="voice.inputLevel()"
          [outputLevel]="voice.outputLevel()"
        />

        <div>
          <p
            class="
              mb-2 text-xs uppercase
              tracking-[0.25em]
              text-eleanor-300/60
            "
          >
            {{ readinessLabel() }}
          </p>

          <h1 class="text-2xl font-semibold">
            {{ voice.message() }}
          </h1>

          <p class="mt-2 text-sm text-slate-500">
            {{
              auth.user()?.name ??
              auth.user()?.email ??
              "Authenticated"
            }}
          </p>
        </div>

        @if (ready() && !voice.connected()) {
          <button
            type="button"
            class="eleanor-button min-w-44 py-3"
            (click)="activate()"
          >
            Activate Eleanor
          </button>
        } @else if (voice.connected()) {
          <button
            type="button"
            class="eleanor-button"
            (click)="voice.disconnect()"
          >
            Disconnect
          </button>
        }
      </section>

      <app-passkey-setup-dialog
        [open]="showPasskeyDialog()"
        [supported]="passkeys.supported()"
        [busy]="passkeyBusy()"
        [error]="passkeyError()"
        (enroll)="enrollPasskey()"
      />

      <app-provider-credential-dialog
        #credentialDialog
        [open]="showCredentialDialog()"
        [busy]="credentialBusy()"
        [error]="credentialError()"
        (save)="saveCredential($event)"
      />
    </main>
  `,
})
export class AssistantPageComponent implements OnInit {
  @ViewChild("credentialDialog")
  private credentialDialog?:
    ProviderCredentialDialogComponent;

  readonly passkeyBusy = signal(false);
  readonly passkeyError = signal<string | null>(null);
  readonly credentialBusy = signal(false);
  readonly credentialError = signal<string | null>(null);

  readonly bootstrapComplete = computed(
    () =>
      !this.passkeys.loading() &&
      !this.credentials.loading(),
  );

  readonly showPasskeyDialog = computed(
    () =>
      this.bootstrapComplete() &&
      !this.passkeys.registered(),
  );

  readonly showCredentialDialog = computed(
    () =>
      this.bootstrapComplete() &&
      this.passkeys.registered() &&
      !this.credentials.configured(),
  );

  readonly ready = computed(
    () =>
      this.bootstrapComplete() &&
      this.passkeys.registered() &&
      this.credentials.configured(),
  );

  readonly readinessLabel = computed(() => {
    if (!this.bootstrapComplete()) {
      return "Loading secure profile";
    }

    if (!this.passkeys.registered()) {
      return "Passkey setup required";
    }

    if (!this.credentials.configured()) {
      return "Provider setup required";
    }

    return "Secure provider connected";
  });

  constructor(
    readonly auth: AuthService,
    readonly passkeys: PasskeyService,
    readonly credentials: ProviderCredentialService,
    readonly voice: RealtimeVoiceService,
    private readonly settings: AssistantSettingsService,
  ) {}

  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.passkeys.load(),
      this.credentials.loadStatus(),
      this.settings.hydrateFromAccount(),
    ]);
  }

  async enrollPasskey(): Promise<void> {
    this.passkeyBusy.set(true);
    this.passkeyError.set(null);

    try {
      await this.passkeys.register();
    } catch (error) {
      this.passkeyError.set(
        error instanceof Error
          ? error.message
          : "Unable to create passkey.",
      );
    } finally {
      this.passkeyBusy.set(false);
    }
  }

  async saveCredential(value: {
    readonly provider: AiProvider;
    readonly apiKey: string;
  }): Promise<void> {
    this.credentialBusy.set(true);
    this.credentialError.set(null);

    try {
      await this.credentials.save(
        value.provider,
        value.apiKey,
      );

      this.credentialDialog?.clear();
    } catch (error) {
      this.credentialError.set(
        error instanceof Error
          ? error.message
          : "Unable to save provider credential.",
      );
    } finally {
      this.credentialBusy.set(false);
    }
  }

  async activate(): Promise<void> {
    if (this.ready()) {
      await this.voice.connect();
    }
  }

  async logout(): Promise<void> {
    this.voice.disconnect();
    await this.auth.logout();
  }
}
```

## `apps/web/src/app/features/assistant/passkey-setup-dialog.component.ts`

```ts
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  effect,
  input,
  output,
} from "@angular/core";

@Component({
  selector: "app-passkey-setup-dialog",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog
      #dialog
      class="
        m-auto w-[calc(100%-2rem)] max-w-lg
        rounded-3xl border border-slate-700/70
        bg-space-950 p-0 text-slate-100
        shadow-[0_40px_120px_rgba(0,0,0,.7)]
        backdrop:bg-black/70
        backdrop:backdrop-blur-sm
      "
      (cancel)="blockClose($event)"
    >
      <section class="p-8">
        <p
          class="
            text-xs uppercase tracking-[0.28em]
            text-eleanor-300/70
          "
        >
          Security setup
        </p>

        <h2 class="mt-3 text-2xl font-semibold">
          Add a passkey.
        </h2>

        <p class="mt-4 text-sm leading-6 text-slate-400">
          Eleanor requires a passkey for fresh step-up verification
          before provider credentials can be viewed, replaced, or removed.
          The private key stays with your authenticator.
        </p>

        @if (!supported()) {
          <p class="mt-5 text-sm text-red-300">
            This browser does not support WebAuthn/passkeys.
          </p>
        }

        @if (error()) {
          <p class="mt-5 text-sm text-red-300">
            {{ error() }}
          </p>
        }

        <button
          type="button"
          class="eleanor-button mt-7 w-full py-3"
          [disabled]="busy() || !supported()"
          (click)="enroll.emit()"
        >
          {{
            busy()
              ? "Waiting for authenticator…"
              : "Create passkey"
          }}
        </button>
      </section>
    </dialog>
  `,
})
export class PasskeySetupDialogComponent {
  readonly open = input(false);
  readonly supported = input(true);
  readonly busy = input(false);
  readonly error = input<string | null>(null);
  readonly enroll = output<void>();

  @ViewChild("dialog", { static: true })
  private readonly dialog!:
    ElementRef<HTMLDialogElement>;

  constructor() {
    effect(() => {
      const element = this.dialog?.nativeElement;

      if (!element) {
        return;
      }

      if (this.open() && !element.open) {
        element.showModal();
      } else if (!this.open() && element.open) {
        element.close();
      }
    });
  }

  blockClose(event: Event): void {
    if (this.open()) {
      event.preventDefault();
    }
  }
}
```

## `apps/web/src/app/features/assistant/provider-credential-dialog.component.ts`

```ts
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  effect,
  input,
  output,
  signal,
} from "@angular/core";

import type {
  AiProvider,
} from "../../core/credentials/provider-credential.service";

@Component({
  selector: "app-provider-credential-dialog",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog
      #dialog
      class="
        m-auto w-[calc(100%-2rem)] max-w-lg
        rounded-3xl border border-slate-700/70
        bg-space-950 p-0 text-slate-100
        shadow-[0_40px_120px_rgba(0,0,0,.7)]
        backdrop:bg-black/70
        backdrop:backdrop-blur-sm
      "
      (cancel)="blockClose($event)"
    >
      <form class="p-8" (submit)="submit($event)">
        <p
          class="
            text-xs uppercase tracking-[0.28em]
            text-eleanor-300/70
          "
        >
          Provider setup
        </p>

        <h2 class="mt-3 text-2xl font-semibold">
          Connect Eleanor.
        </h2>

        <p class="mt-4 text-sm leading-6 text-slate-400">
          The API key is submitted to Eleanor's BFF, encrypted at rest,
          and never returned to browser JavaScript. Saving requires
          a fresh passkey verification.
        </p>

        <label class="mt-6 block text-xs text-slate-400">
          API Provider
        </label>

        <select
          class="eleanor-input mt-2"
          [value]="provider()"
          (change)="provider.set(readProvider($event))"
        >
          <option value="openai">
            OpenAI
          </option>
        </select>

        <label class="mt-5 block text-xs text-slate-400">
          API Key
        </label>

        <input
          class="eleanor-input mt-2 font-mono"
          type="password"
          autocomplete="off"
          spellcheck="false"
          placeholder="Enter API key"
          [value]="apiKey()"
          (input)="apiKey.set(readInput($event))"
        >

        @if (error()) {
          <p class="mt-4 text-sm text-red-300">
            {{ error() }}
          </p>
        }

        <button
          type="submit"
          class="eleanor-button mt-7 w-full py-3"
          [disabled]="busy() || apiKey().trim().length < 20"
        >
          {{
            busy()
              ? "Verifying & securing…"
              : "Connect provider"
          }}
        </button>
      </form>
    </dialog>
  `,
})
export class ProviderCredentialDialogComponent {
  readonly open = input(false);
  readonly busy = input(false);
  readonly error = input<string | null>(null);

  readonly save = output<{
    readonly provider: AiProvider;
    readonly apiKey: string;
  }>();

  readonly provider =
    signal<AiProvider>("openai");

  readonly apiKey = signal("");

  @ViewChild("dialog", { static: true })
  private readonly dialog!:
    ElementRef<HTMLDialogElement>;

  constructor() {
    effect(() => {
      const element = this.dialog?.nativeElement;

      if (!element) {
        return;
      }

      if (this.open() && !element.open) {
        element.showModal();
      } else if (!this.open() && element.open) {
        element.close();
      }
    });
  }

  submit(event: Event): void {
    event.preventDefault();

    const apiKey = this.apiKey().trim();

    if (apiKey.length >= 20) {
      this.save.emit({
        provider: this.provider(),
        apiKey,
      });
    }
  }

  clear(): void {
    this.apiKey.set("");
  }

  blockClose(event: Event): void {
    if (this.open()) {
      event.preventDefault();
    }
  }

  readProvider(event: Event): AiProvider {
    return (
      event.target as HTMLSelectElement
    ).value as AiProvider;
  }

  readInput(event: Event): string {
    return (
      event.target as HTMLInputElement
    ).value;
  }
}
```

## `apps/web/src/app/features/assistant/voice-orb-island.component.ts`

```ts
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  ViewChild,
  effect,
  inject,
  input,
} from "@angular/core";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";

import type {
  VoiceConnectionState,
} from "../../core/realtime/realtime.types";
import { VoiceOrb } from "./voice-orb.react";

@Component({
  selector: "app-voice-orb-island",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div #reactRoot class="grid place-items-center"></div>
  `,
})
export class VoiceOrbIslandComponent
  implements AfterViewInit {
  readonly state =
    input.required<VoiceConnectionState>();

  readonly inputLevel = input(0);
  readonly outputLevel = input(0);

  @ViewChild("reactRoot", { static: true })
  private readonly host!:
    ElementRef<HTMLDivElement>;

  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private root: Root | null = null;

  ngAfterViewInit(): void {
    this.root = createRoot(
      this.host.nativeElement,
    );

    effect(
      () => {
        this.root?.render(
          createElement(VoiceOrb, {
            state: this.state(),
            inputLevel: this.inputLevel(),
            outputLevel: this.outputLevel(),
          }),
        );
      },
      {
        injector: this.injector,
      },
    );

    this.destroyRef.onDestroy(() => {
      this.root?.unmount();
      this.root = null;
    });
  }
}
```

## `apps/web/src/app/features/assistant/voice-orb.react.ts`

```ts
import { createElement } from "react";
import type {
  CSSProperties,
  ReactElement,
} from "react";

import type {
  VoiceConnectionState,
} from "../../core/realtime/realtime.types";

export interface VoiceOrbProps {
  readonly state: VoiceConnectionState;
  readonly inputLevel: number;
  readonly outputLevel: number;
}

export function VoiceOrb(
  props: VoiceOrbProps,
): ReactElement {
  const input =
    Math.min(1, Math.max(0, props.inputLevel));

  const output =
    Math.min(1, Math.max(0, props.outputLevel));

  const inputStyle: CSSProperties = {
    transform: `scale(${1 + input * 0.2})`,
    opacity:
      props.state === "listening"
        ? 0.2 + input * 0.8
        : 0.12,
  };

  const outputStyle: CSSProperties = {
    transform: `scale(${1 + output * 0.18})`,
    opacity:
      props.state === "speaking"
        ? 0.25 + output * 0.75
        : 0.3,
  };

  return createElement(
    "div",
    {
      className:
        "relative grid size-72 place-items-center",
      role: "img",
      "aria-label": `Eleanor ${props.state}`,
    },
    createElement("div", {
      className:
        "absolute inset-8 rounded-full border border-eleanor-300/50 transition-all duration-75",
      style: inputStyle,
    }),
    createElement("div", {
      className:
        "absolute size-56 rounded-full bg-eleanor-400/20 blur-3xl transition-all duration-75",
      style: outputStyle,
    }),
    createElement("div", {
      className:
        "size-36 rounded-full border border-eleanor-300/60 bg-[radial-gradient(circle_at_35%_28%,rgba(255,255,255,.98),rgba(56,196,255,.72)_18%,rgba(9,168,234,.38)_43%,rgba(7,17,31,.94)_74%)] shadow-[0_0_80px_rgba(9,168,234,.28)]",
    }),
  );
}
```

## `apps/web/src/app/features/auth/login-page.component.ts`

```ts
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
} from "@angular/core";
import {
  ActivatedRoute,
  Router,
} from "@angular/router";

import { AuthService } from "../../core/auth/auth.service";

@Component({
  selector: "app-login-page",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main
      class="
        grid min-h-screen place-items-center
        bg-space-975 px-6 text-slate-100
      "
    >
      <section
        class="
          eleanor-panel w-full max-w-md
          px-8 py-10 text-center
        "
      >
        <div
          class="
            mx-auto mb-8 grid size-20
            place-items-center rounded-full
            border border-eleanor-300/30
            bg-eleanor-400/10
          "
        >
          <span
            class="
              size-6 rounded-full bg-eleanor-300
              shadow-[0_0_24px_currentColor]
            "
          ></span>
        </div>

        <p
          class="
            text-xs uppercase tracking-[0.35em]
            text-eleanor-300/70
          "
        >
          ELEANOR
        </p>

        <h1 class="mt-4 text-3xl font-semibold">
          Welcome back.
        </h1>

        <p class="mt-4 text-sm leading-6 text-slate-400">
          Sign in through your identity provider.
          Eleanor never handles your account password.
        </p>

        <button
          type="button"
          class="eleanor-button mt-8 w-full py-3"
          (click)="login()"
        >
          Continue securely
        </button>
      </section>
    </main>
  `,
})
export class LoginPageComponent implements OnInit {
  constructor(
    private readonly auth: AuthService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.auth.ensureLoaded();

    if (this.auth.authenticated()) {
      await this.router.navigateByUrl(this.returnUrl());
    }
  }

  login(): void {
    this.auth.login(this.returnUrl());
  }

  private returnUrl(): string {
    const value =
      this.route.snapshot.queryParamMap.get("returnUrl");

    return (
      value?.startsWith("/") &&
      !value.startsWith("//")
    )
      ? value
      : "/assistant";
  }
}
```

## `apps/web/src/app/features/security/security-page.component.ts`

```ts
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  signal,
} from "@angular/core";
import { RouterLink } from "@angular/router";

import type {
  AiProvider,
  ProviderCredentialDetails,
} from "../../core/credentials/provider-credential.service";
import {
  ProviderCredentialService,
} from "../../core/credentials/provider-credential.service";
import { PasskeyService } from "../../core/passkeys/passkey.service";

@Component({
  selector: "app-security-page",
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main
      class="
        min-h-screen bg-space-975
        px-6 py-8 text-slate-100
      "
    >
      <div class="mx-auto max-w-3xl">
        <header
          class="
            mb-8 flex items-center
            justify-between gap-6
          "
        >
          <div>
            <p
              class="
                text-xs uppercase tracking-[0.3em]
                text-eleanor-300/70
              "
            >
              Eleanor / Security
            </p>

            <h1 class="mt-2 text-3xl font-semibold">
              Credential security
            </h1>
          </div>

          <a
            routerLink="/settings"
            class="eleanor-button"
          >
            Back
          </a>
        </header>

        <section class="eleanor-panel p-6">
          <div
            class="
              flex flex-wrap items-center
              justify-between gap-4
            "
          >
            <div>
              <h2 class="font-semibold">
                Passkeys
              </h2>

              <p class="mt-1 text-sm text-slate-500">
                {{ passkeys.count() }}
                registered authenticator(s)
              </p>
            </div>

            <button
              type="button"
              class="eleanor-button"
              [disabled]="busy()"
              (click)="addPasskey()"
            >
              Add passkey
            </button>
          </div>
        </section>

        <section class="eleanor-panel mt-4 p-6">
          <h2 class="font-semibold">
            AI provider credential
          </h2>

          <p class="mt-2 text-sm leading-6 text-slate-500">
            Viewing metadata, replacing the key, and deleting the
            credential all require a fresh passkey verification.
            Eleanor never reveals the stored raw key.
          </p>

          <div class="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              class="eleanor-button"
              [disabled]="busy() || !credentials.configured()"
              (click)="viewDetails()"
            >
              View metadata
            </button>

            <button
              type="button"
              class="eleanor-button"
              [disabled]="busy() || !credentials.configured()"
              (click)="removeCredential()"
            >
              Remove credential
            </button>
          </div>

          @if (details()) {
            <div
              class="
                mt-5 rounded-xl border
                border-slate-800 bg-space-950/50 p-4
              "
            >
              <p class="text-sm text-slate-300">
                Provider: {{ details()!.provider }}
              </p>

              <p class="mt-1 font-mono text-sm text-slate-500">
                Key: {{ details()!.maskedApiKey }}
              </p>

              <p class="mt-1 text-xs text-slate-600">
                Updated: {{ details()!.updatedAt }}
              </p>
            </div>
          }

          <form
            class="
              mt-6 grid gap-3
              sm:grid-cols-[10rem_1fr_auto]
            "
            (submit)="replaceCredential($event)"
          >
            <select
              class="eleanor-input"
              [value]="provider()"
              (change)="provider.set(readProvider($event))"
            >
              <option value="openai">
                OpenAI
              </option>
            </select>

            <input
              class="eleanor-input font-mono"
              type="password"
              autocomplete="off"
              spellcheck="false"
              placeholder="New API key"
              [value]="newApiKey()"
              (input)="newApiKey.set(readInput($event))"
            >

            <button
              type="submit"
              class="eleanor-button"
              [disabled]="busy() || newApiKey().trim().length < 20"
            >
              Replace
            </button>
          </form>

          @if (message()) {
            <p class="mt-4 text-sm text-eleanor-200">
              {{ message() }}
            </p>
          }

          @if (error()) {
            <p class="mt-4 text-sm text-red-300">
              {{ error() }}
            </p>
          }
        </section>
      </div>
    </main>
  `,
})
export class SecurityPageComponent implements OnInit {
  readonly busy = signal(false);
  readonly details =
    signal<ProviderCredentialDetails | null>(null);
  readonly provider = signal<AiProvider>("openai");
  readonly newApiKey = signal("");
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  constructor(
    readonly passkeys: PasskeyService,
    readonly credentials: ProviderCredentialService,
  ) {}

  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.passkeys.load(),
      this.credentials.loadStatus(),
    ]);
  }

  async addPasskey(): Promise<void> {
    await this.perform(async () => {
      if (this.passkeys.registered()) {
        await this.passkeys.ensureStepUp();
      }

      await this.passkeys.register();
      this.message.set("Passkey added.");
    });
  }

  async viewDetails(): Promise<void> {
    await this.perform(async () => {
      this.details.set(
        await this.credentials.details(),
      );
    });
  }

  async removeCredential(): Promise<void> {
    await this.perform(async () => {
      await this.credentials.remove();
      this.details.set(null);
      this.message.set("Provider credential removed.");
    });
  }

  async replaceCredential(event: Event): Promise<void> {
    event.preventDefault();

    const apiKey = this.newApiKey().trim();

    if (apiKey.length < 20) {
      return;
    }

    await this.perform(async () => {
      await this.credentials.save(
        this.provider(),
        apiKey,
      );

      this.newApiKey.set("");
      this.details.set(
        await this.credentials.details(),
      );
      this.message.set("Provider credential replaced.");
    });
  }

  readProvider(event: Event): AiProvider {
    return (
      event.target as HTMLSelectElement
    ).value as AiProvider;
  }

  readInput(event: Event): string {
    return (
      event.target as HTMLInputElement
    ).value;
  }

  private async perform(
    operation: () => Promise<void>,
  ): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.message.set(null);

    try {
      await operation();
    } catch (error) {
      this.error.set(
        error instanceof Error
          ? error.message
          : "Security operation failed.",
      );
    } finally {
      this.busy.set(false);
    }
  }
}
```

## `apps/web/src/app/features/settings/settings-page.component.ts`

```ts
import {
  ChangeDetectionStrategy,
  Component,
} from "@angular/core";
import { RouterLink } from "@angular/router";

import {
  ProviderCredentialService,
} from "../../core/credentials/provider-credential.service";
import { PasskeyService } from "../../core/passkeys/passkey.service";
import {
  AssistantSettingsService,
} from "../../core/settings/assistant-settings.service";
import type {
  AssistantFormality,
  AssistantInitiative,
  AssistantPersonality,
  AssistantTurnTaking,
  AssistantVerbosity,
  AssistantVoice,
} from "../../core/settings/assistant-settings.types";
import {
  SegmentedControlComponent,
} from "../../shared/segmented-control/segmented-control.component";
import type {
  SegmentedControlOption,
} from "../../shared/segmented-control/segmented-control.component";

@Component({
  selector: "app-settings-page",
  standalone: true,
  imports: [
    RouterLink,
    SegmentedControlComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main
      class="
        min-h-screen bg-space-975
        px-6 py-8 text-slate-100
      "
    >
      <div class="mx-auto max-w-5xl">
        <header
          class="
            mb-8 flex items-center
            justify-between
          "
        >
          <div>
            <p
              class="
                text-xs uppercase
                tracking-[0.3em]
                text-eleanor-300/70
              "
            >
              Eleanor / Settings
            </p>

            <h1 class="mt-2 text-3xl font-semibold">
              Personality & security
            </h1>
          </div>

          <div class="flex gap-3">
            <a
              routerLink="/security"
              class="eleanor-button"
            >
              Security
            </a>

            <a
              routerLink="/assistant"
              class="eleanor-button"
            >
              Back
            </a>
          </div>
        </header>

        <section
          class="
            grid gap-4
            lg:grid-cols-2
          "
        >
          <article class="eleanor-setting-card">
            <h2 class="eleanor-setting-title">
              Personality
            </h2>

            <app-segmented-control
              [options]="personalityOptions"
              [value]="settings.settings().personality"
              (valueChange)="changePersonality($event)"
            />
          </article>

          <article class="eleanor-setting-card">
            <h2 class="eleanor-setting-title">
              Verbosity
            </h2>

            <app-segmented-control
              [options]="verbosityOptions"
              [value]="settings.settings().verbosity"
              (valueChange)="changeVerbosity($event)"
            />
          </article>

          <article class="eleanor-setting-card">
            <h2 class="eleanor-setting-title">
              Formality
            </h2>

            <app-segmented-control
              [options]="formalityOptions"
              [value]="settings.settings().formality"
              (valueChange)="changeFormality($event)"
            />
          </article>

          <article class="eleanor-setting-card">
            <h2 class="eleanor-setting-title">
              Initiative
            </h2>

            <app-segmented-control
              [options]="initiativeOptions"
              [value]="settings.settings().initiative"
              (valueChange)="changeInitiative($event)"
            />
          </article>

          <article class="eleanor-setting-card">
            <h2 class="eleanor-setting-title">
              Turn-taking
            </h2>

            <app-segmented-control
              [options]="turnTakingOptions"
              [value]="settings.settings().turnTaking"
              (valueChange)="changeTurnTaking($event)"
            />
          </article>

          <article class="eleanor-setting-card">
            <h2 class="eleanor-setting-title">
              Humor · {{ settings.settings().humor }}
            </h2>

            <input
              class="eleanor-range"
              type="range"
              min="0"
              max="3"
              step="1"
              [value]="settings.settings().humor"
              (input)="changeHumor($event)"
            >
          </article>

          <article class="eleanor-setting-card">
            <h2 class="eleanor-setting-title">
              Speech speed ·
              {{ settings.settings().speechSpeed.toFixed(2) }}×
            </h2>

            <input
              class="eleanor-range"
              type="range"
              min="0.75"
              max="1.30"
              step="0.05"
              [value]="settings.settings().speechSpeed"
              (input)="changeSpeechSpeed($event)"
            >
          </article>

          <article
            class="
              eleanor-setting-card
              lg:col-span-2
            "
          >
            <h2 class="eleanor-setting-title">
              Voice
            </h2>

            <app-segmented-control
              [options]="voiceOptions"
              [value]="settings.settings().voice"
              (valueChange)="changeVoice($event)"
            />
          </article>

          <article
            class="
              eleanor-panel p-6
              lg:col-span-2
            "
          >
            <h2 class="text-lg font-semibold">
              Security
            </h2>

            <div class="mt-4 flex flex-wrap gap-3">
              <span class="eleanor-chip">
                Passkeys: {{ passkeys.count() }}
              </span>

              <span class="eleanor-chip">
                Provider:
                {{ credentials.provider() ?? "not configured" }}
              </span>

              <span class="eleanor-chip">
                Profile:
                {{ settings.profileMetric() }}
              </span>
            </div>

            <p
              class="
                mt-4 text-sm leading-6
                text-slate-500
              "
            >
              Credential metadata and credential changes require a
              fresh passkey step-up. The stored raw API key is never
              returned to the browser.
            </p>
          </article>
        </section>
      </div>
    </main>
  `,
})
export class SettingsPageComponent {
  readonly personalityOptions =
    options(
      "Professional",
      "Warm",
      "Witty",
      "Direct",
    );

  readonly verbosityOptions =
    options(
      "Brief",
      "Balanced",
      "Detailed",
    );

  readonly formalityOptions =
    options(
      "Casual",
      "Neutral",
      "Formal",
    );

  readonly initiativeOptions =
    options(
      "Reactive",
      "Balanced",
      "Proactive",
    );

  readonly turnTakingOptions =
    options(
      "Patient",
      "Balanced",
      "Quick",
    );

  readonly voiceOptions:
    readonly SegmentedControlOption[] =
    [
      "marin",
      "cedar",
      "alloy",
      "ash",
      "ballad",
      "coral",
      "echo",
      "sage",
      "shimmer",
      "verse",
    ].map((value) => ({
      value,
      label:
        value[0]!.toUpperCase() +
        value.slice(1),
    }));

  constructor(
    readonly settings: AssistantSettingsService,
    readonly passkeys: PasskeyService,
    readonly credentials: ProviderCredentialService,
  ) {}

  changePersonality(value: string): void {
    this.settings.updatePersonality(
      value as AssistantPersonality,
    );
  }

  changeVerbosity(value: string): void {
    this.settings.updateVerbosity(
      value as AssistantVerbosity,
    );
  }

  changeFormality(value: string): void {
    this.settings.updateFormality(
      value as AssistantFormality,
    );
  }

  changeInitiative(value: string): void {
    this.settings.updateInitiative(
      value as AssistantInitiative,
    );
  }

  changeTurnTaking(value: string): void {
    this.settings.updateTurnTaking(
      value as AssistantTurnTaking,
    );
  }

  changeVoice(value: string): void {
    this.settings.updateVoice(
      value as AssistantVoice,
    );
  }

  changeHumor(event: Event): void {
    this.settings.updateHumor(
      Number(
        (event.target as HTMLInputElement).value,
      ),
    );
  }

  changeSpeechSpeed(event: Event): void {
    this.settings.updateSpeechSpeed(
      Number(
        (event.target as HTMLInputElement).value,
      ),
    );
  }
}

function options(
  ...labels: string[]
): readonly SegmentedControlOption[] {
  return labels.map((label) => ({
    label,
    value: label.toLowerCase(),
  }));
}
```

## `apps/web/src/app/shared/segmented-control/segmented-control.component.ts`

```ts
import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from "@angular/core";

export interface SegmentedControlOption {
  readonly value: string;
  readonly label: string;
}

@Component({
  selector: "app-segmented-control",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      role="radiogroup"
      class="
        flex overflow-x-auto rounded-xl
        border border-slate-700/70
        bg-space-950/70 p-1
      "
    >
      @for (option of options(); track option.value) {
        <button
          type="button"
          role="radio"
          class="
            min-w-max rounded-lg px-4 py-2
            text-sm transition
            focus-visible:outline-none
            focus-visible:ring-2
            focus-visible:ring-eleanor-300/40
          "
          [class.bg-eleanor-400/15]="
            option.value === value()
          "
          [class.text-eleanor-100]="
            option.value === value()
          "
          [class.text-slate-500]="
            option.value !== value()
          "
          [attr.aria-checked]="
            option.value === value()
          "
          (click)="select(option.value)"
        >
          {{ option.label }}
        </button>
      }
    </div>
  `,
})
export class SegmentedControlComponent {
  readonly options =
    input.required<readonly SegmentedControlOption[]>();

  readonly value =
    input.required<string>();

  readonly valueChange =
    output<string>();

  select(value: string): void {
    if (value !== this.value()) {
      this.valueChange.emit(value);
    }
  }
}
```

## `apps/web/src/index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Eleanor</title>
    <base href="/">
    <meta name="viewport" content="width=device-width, initial-scale=1">
  </head>
  <body>
    <app-root></app-root>
  </body>
</html>
```

## `apps/web/src/main.ts`

```ts
import { provideZonelessChangeDetection } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { provideRouter } from "@angular/router";

import { AppComponent } from "./app/app.component";
import { routes } from "./app/app.routes";

bootstrapApplication(AppComponent, {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes),
  ],
}).catch((error: unknown) => {
  console.error("Unable to bootstrap Eleanor:", error);
});
```

## `apps/web/src/styles.css`

```css
@import "tailwindcss";

@theme {
  --color-eleanor-100: oklch(0.94 0.045 211);
  --color-eleanor-200: oklch(0.88 0.075 213);
  --color-eleanor-300: oklch(0.81 0.11 216);
  --color-eleanor-400: oklch(0.73 0.145 220);
  --color-eleanor-500: oklch(0.65 0.16 226);

  --color-space-900: oklch(0.16 0.025 255);
  --color-space-950: oklch(0.115 0.02 255);
  --color-space-975: oklch(0.09 0.018 255);
}

:root {
  color-scheme: dark;
}

html,
body {
  min-height: 100%;
  margin: 0;
  background:
    radial-gradient(
      circle at 20% -10%,
      rgb(56 196 255 / 0.08),
      transparent 35rem
    ),
    var(--color-space-975);
  font-family:
    Inter,
    ui-sans-serif,
    system-ui,
    sans-serif;
}

button,
input,
select {
  font: inherit;
}

@layer components {
  .eleanor-panel,
  .eleanor-setting-card {
    border: 1px solid rgb(51 65 85 / 0.58);
    border-radius: 1.25rem;
    background:
      linear-gradient(
        145deg,
        rgb(15 23 42 / 0.82),
        rgb(8 15 30 / 0.67)
      );
    backdrop-filter: blur(22px);
  }

  .eleanor-setting-card {
    display: flex;
    min-height: 10rem;
    flex-direction: column;
    justify-content: space-between;
    gap: 1.5rem;
    padding: 1.5rem;
    transition:
      transform 180ms cubic-bezier(0.22, 1, 0.36, 1),
      border-color 180ms cubic-bezier(0.22, 1, 0.36, 1),
      box-shadow 180ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .eleanor-setting-card:hover,
  .eleanor-setting-card:focus-within {
    transform: translateY(-2px);
    border-color: rgb(56 196 255 / 0.3);
    box-shadow:
      0 24px 70px rgb(0 0 0 / 0.3);
  }

  .eleanor-setting-title {
    font-size: 0.95rem;
    font-weight: 650;
  }

  .eleanor-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgb(71 85 105 / 0.78);
    border-radius: 999px;
    background: rgb(15 23 42 / 0.58);
    padding: 0.67rem 1.1rem;
    color: rgb(203 213 225);
    cursor: pointer;
    transition: 150ms ease;
  }

  .eleanor-button:hover:not(:disabled) {
    transform: translateY(-1px);
    border-color: rgb(56 196 255 / 0.4);
    background: rgb(56 196 255 / 0.07);
    color: white;
  }

  .eleanor-button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .eleanor-input {
    width: 100%;
    border: 1px solid rgb(51 65 85);
    border-radius: 0.8rem;
    background: var(--color-space-900);
    padding: 0.8rem 1rem;
    color: rgb(241 245 249);
    outline: none;
    transition: 150ms ease;
  }

  .eleanor-input:focus {
    border-color: rgb(56 196 255 / 0.55);
    box-shadow:
      0 0 0 4px rgb(56 196 255 / 0.1);
  }

  .eleanor-range {
    width: 100%;
    accent-color: var(--color-eleanor-400);
  }

  .eleanor-chip {
    border: 1px solid rgb(56 196 255 / 0.15);
    border-radius: 999px;
    background: rgb(56 196 255 / 0.05);
    padding: 0.4rem 0.7rem;
    font-size: 0.72rem;
    color: rgb(148 163 184);
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
  }
}
```

## `apps/web/tsconfig.app.json`

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "./out-tsc/app"
  },
  "files": ["src/main.ts"],
  "include": ["src/**/*.d.ts"]
}
```

## `apps/web/tsconfig.json`

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "preserve",
    "moduleResolution": "bundler",
    "experimentalDecorators": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "lib": ["ES2022", "dom"]
  },
  "angularCompilerOptions": {
    "strictInjectionParameters": true,
    "strictTemplates": true
  }
}
```

## `package.json`

```json
{
  "name": "eleanor",
  "version": "0.7.0",
  "private": true,
  "workspaces": ["apps/*"],
  "scripts": {
    "dev": "concurrently -n api,web \"npm run dev -w @eleanor/api\" \"npm run start -w @eleanor/web\"",
    "build": "npm run build -w @eleanor/api && npm run build -w @eleanor/web",
    "test": "npm run test -w @eleanor/api && npm run test -w @eleanor/web",
    "test:e2e": "playwright test",
    "benchmark": "node scripts/benchmark.mjs"
  },
  "devDependencies": {
    "@playwright/test": "^1.55.0",
    "concurrently": "^9.2.0"
  }
}
```

## `playwright.config.ts`

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:4200",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [{
    name: "chromium",
    use: {
      ...devices["Desktop Chrome"],
      permissions: ["microphone"],
      launchOptions: {
        args: [
          "--use-fake-ui-for-media-stream",
          "--use-fake-device-for-media-stream"
        ]
      }
    }
  }],
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: "npm run start -w @eleanor/web",
    url: "http://127.0.0.1:4200",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
```

## `scripts/benchmark.mjs`

```js
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { performance } from "node:perf_hooks";

const profileRuns = [];
for (let round = 0; round < 10; round += 1) {
  const started = performance.now();
  const observed = new Set();
  for (let voice = 0; voice < 10; voice += 1)
    for (let speed = 0; speed < 12; speed += 1)
      for (let humor = 0; humor < 4; humor += 1)
        for (let turn = 0; turn < 3; turn += 1)
          for (let initiative = 0; initiative < 3; initiative += 1)
            for (let formality = 0; formality < 3; formality += 1)
              for (let verbosity = 0; verbosity < 3; verbosity += 1)
                for (let personality = 0; personality < 4; personality += 1) {
                  observed.add(
                    1_000_000 +
                    personality +
                    verbosity * 4 +
                    formality * 12 +
                    initiative * 36 +
                    turn * 108 +
                    humor * 324 +
                    speed * 1296 +
                    voice * 15552
                  );
                }
  if (observed.size !== 155_520) throw new Error("Profile collision detected");
  profileRuns.push(performance.now() - started);
}

const key = randomBytes(32);
const plaintext = "sk-example-provider-secret-with-realistic-length";
const cryptoStarted = performance.now();
for (let i = 0; i < 25_000; i += 1) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const output = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  if (output !== plaintext) throw new Error("AES-GCM benchmark failed");
}
const cryptoMs = performance.now() - cryptoStarted;

const tokenStarted = performance.now();
for (let i = 0; i < 100_000; i += 1) randomBytes(32).toString("base64url");
const tokenMs = performance.now() - tokenStarted;

profileRuns.sort((a, b) => a - b);
console.log(JSON.stringify({
  profiles: {
    count: 155520,
    collisions: 0,
    fastestMs: profileRuns[0],
    medianMs: profileRuns[Math.floor(profileRuns.length / 2)],
    slowestMs: profileRuns.at(-1)
  },
  aes256Gcm: {
    roundTrips: 25000,
    totalMs: cryptoMs,
    perRoundTripUs: cryptoMs * 1000 / 25000
  },
  secureTokens: {
    count: 100000,
    totalMs: tokenMs,
    perTokenUs: tokenMs * 1000 / 100000
  }
}, null, 2));
```

## `tests/e2e/auth-gate.spec.ts`

```ts
import { expect, test } from "@playwright/test";

test("anonymous users are redirected to login", async ({
  page,
}) => {
  await page.route(
    "**/api/auth/session",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          authenticated: false,
          user: null,
          csrfToken: "test-csrf",
        }),
      });
    },
  );

  await page.goto("/assistant");

  await expect(page).toHaveURL(/\/login/);

  await expect(
    page.getByRole("button", {
      name: "Continue securely",
    }),
  ).toBeVisible();
});
```

## `tests/e2e/provider-gate.spec.ts`

```ts
import { expect, test } from "@playwright/test";

test(
  "users with a passkey but no provider see provider setup before activation",
  async ({ page }) => {
    await page.route(
      "**/api/auth/session",
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            authenticated: true,
            user: {
              id: "user-test",
              name: "Test User",
            },
            csrfToken: "test-csrf",
          }),
        });
      },
    );

    await page.route(
      "**/api/passkeys/status",
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            registered: true,
            count: 1,
            stepUpVerifiedAt: Date.now(),
          }),
        });
      },
    );

    await page.route(
      "**/api/provider-credentials/status",
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            configured: false,
            provider: null,
          }),
        });
      },
    );

    await page.route(
      "**/api/assistant-profile",
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            profile: {
              metric: "1131380",
              schemaVersion: 1,
              updatedAt: new Date().toISOString(),
            },
          }),
        });
      },
    );

    await page.goto("/assistant");

    await expect(
      page.getByRole("dialog"),
    ).toBeVisible();

    await expect(
      page.getByText("Connect Eleanor."),
    ).toBeVisible();

    await expect(
      page.getByRole("button", {
        name: "Activate Eleanor",
      }),
    ).toHaveCount(0);
  },
);
```

## `tests/e2e/security-bootstrap.spec.ts`

```ts
import { expect, test } from "@playwright/test";

test(
  "authenticated users without passkeys see passkey setup before provider setup",
  async ({ page }) => {
    await page.route(
      "**/api/auth/session",
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            authenticated: true,
            user: {
              id: "user-test",
              name: "Test User",
            },
            csrfToken: "test-csrf",
          }),
        });
      },
    );

    await page.route(
      "**/api/passkeys/status",
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            registered: false,
            count: 0,
            stepUpVerifiedAt: null,
          }),
        });
      },
    );

    await page.route(
      "**/api/provider-credentials/status",
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            configured: false,
            provider: null,
          }),
        });
      },
    );

    await page.route(
      "**/api/assistant-profile",
      async (route) => {
        if (route.request().method() === "GET") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              profile: {
                metric: "1131380",
                schemaVersion: 1,
                updatedAt: new Date().toISOString(),
              },
            }),
          });
          return;
        }

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ profile: null }),
        });
      },
    );

    await page.goto("/assistant");

    await expect(
      page.getByRole("dialog"),
    ).toBeVisible();

    await expect(
      page.getByText("Add a passkey."),
    ).toBeVisible();

    await expect(
      page.getByRole("button", {
        name: "Activate Eleanor",
      }),
    ).toHaveCount(0);
  },
);
```

## `tests/e2e/webrtc-local.spec.ts`

```ts
import { expect, test } from "@playwright/test";

test(
  "fake microphone traverses a real local WebRTC connection",
  async ({ page }) => {
    await page.route(
      "**/api/auth/session",
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            authenticated: false,
            user: null,
            csrfToken: "test-csrf",
          }),
        });
      },
    );

    await page.goto("/login");

    const result = await page.evaluate(async () => {
      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: true,
        });

      const track = stream.getAudioTracks()[0];

      if (!track) {
        throw new Error("No audio track.");
      }

      const sender = new RTCPeerConnection();
      const receiver = new RTCPeerConnection();

      sender.addEventListener(
        "icecandidate",
        (event) => {
          if (event.candidate) {
            void receiver.addIceCandidate(event.candidate);
          }
        },
      );

      receiver.addEventListener(
        "icecandidate",
        (event) => {
          if (event.candidate) {
            void sender.addIceCandidate(event.candidate);
          }
        },
      );

      const remoteTrack =
        new Promise<MediaStreamTrack>((resolve) => {
          receiver.addEventListener(
            "track",
            (event) => resolve(event.track),
            { once: true },
          );
        });

      sender.addTrack(track, stream);

      const offer = await sender.createOffer();
      await sender.setLocalDescription(offer);
      await receiver.setRemoteDescription(offer);

      const answer = await receiver.createAnswer();
      await receiver.setLocalDescription(answer);
      await sender.setRemoteDescription(answer);

      const received = await remoteTrack;

      const result = {
        localKind: track.kind,
        remoteKind: received.kind,
      };

      sender.close();
      receiver.close();

      stream
        .getTracks()
        .forEach((item) => item.stop());

      return result;
    });

    expect(result.localKind).toBe("audio");
    expect(result.remoteKind).toBe("audio");
  },
);
```

## `vercel.json`

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://YOUR-ELEANOR-API.up.railway.app/api/:path*"
    }
  ]
}
```
