import { randomBytes } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { createApp } from "./app.js";
import { silentLogger } from "./core/logger.js";
import { createRedisRateLimitMiddleware } from "./middleware/rate-limit.js";
import type { OidcClient } from "./modules/auth/oidc/service.js";
import { SessionService } from "./modules/auth/session/service.js";
import { CredentialCryptoService } from "./modules/credentials/crypto/service.js";
import { CredentialService } from "./modules/credentials/service.js";
import { PasskeyService } from "./modules/passkey/service.js";
import { RealtimeProviderError } from "./modules/realtime/provider.js";
import type { RealtimeProviderFactory } from "./modules/realtime/provider.js";
import { FakeRedis } from "./testing/fake-redis.js";
import {
  MemoryCredentials,
  MemoryPasskeys,
  MemoryProfiles,
  MemoryUsers,
} from "./testing/memory-repositories.js";

const ORIGIN = "http://localhost:4200";
const SDP_OFFER = "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\n";
const SDP_ANSWER = "v=0\r\no=- 3 4 IN IP4 127.0.0.1\r\ns=-\r\n";

function setup(options: { rateLimit?: number } = {}) {
  const redis = new FakeRedis();
  const sessions = new SessionService(redis.asClient(), {
    production: false,
    ttlSeconds: 3_600,
  });
  const users = new MemoryUsers();
  const profiles = new MemoryProfiles();
  const credentialRows = new MemoryCredentials();
  const credentials = new CredentialService(
    credentialRows,
    new CredentialCryptoService(randomBytes(32).toString("base64")),
  );
  const passkeys = new PasskeyService(new MemoryPasskeys(), sessions, {
    rpId: "localhost",
    rpName: "Eleanor",
    expectedOrigin: ORIGIN,
    enrollmentMaxOidcAgeSeconds: 600,
    stepUpTtlSeconds: 300,
  });

  const oidc: OidcClient & { subject: string; forced: boolean[] } = {
    subject: "user-1",
    forced: [],
    async begin(returnTo, opts) {
      this.forced.push(Boolean(opts?.forceReauthentication));
      return {
        transaction: {
          codeVerifier: "verifier",
          state: "state",
          nonce: "nonce",
          returnTo,
          createdAt: Date.now(),
        },
        authorizationUrl: new URL("http://idp.test/authorize?state=state"),
      };
    },
    async complete() {
      return { user: { id: this.subject, name: "Test" }, idTokenHint: "id-token" };
    },
    logoutUrl: () => "http://idp.test/logout",
  };

  const providerCalls: string[] = [];
  let providerBehaviour: "ok" | "auth" = "ok";
  const realtimeProviderFactory: RealtimeProviderFactory = (apiKey) => ({
    async createCall() {
      providerCalls.push(apiKey);
      if (providerBehaviour === "auth") throw new RealtimeProviderError(401, "PROVIDER_AUTH_FAILED");
      return SDP_ANSWER;
    },
  });

  const app = createApp({
    logger: silentLogger,
    publicOrigin: ORIGIN,
    stepUpTtlSeconds: 300,
    sessions,
    oidc,
    users,
    profiles,
    credentials,
    passkeys,
    realtimeRateLimit: createRedisRateLimitMiddleware(
      redis.asClient(),
      options.rateLimit ?? 20,
    ),
    realtimeProviderFactory,
    readinessChecks: { redis: () => redis.ping() },
  });

  /** Seeds an authenticated session and returns its cookie + CSRF token. */
  async function signIn(extra: { stepUp?: boolean; userId?: string } = {}) {
    const id = randomBytes(16).toString("hex");
    const csrfToken = randomBytes(16).toString("hex");
    await sessions.save({
      id,
      data: {
        csrfToken,
        createdAt: Date.now(),
        authenticatedAt: Date.now(),
        user: { id: extra.userId ?? "user-1" },
        ...(extra.stepUp ? { stepUpVerifiedAt: Date.now() } : {}),
      },
    });
    return { cookie: `eleanor-session=${id}`, csrfToken };
  }

  return {
    app,
    redis,
    users,
    profiles,
    credentials,
    oidc,
    providerCalls,
    setProvider: (b: "ok" | "auth") => (providerBehaviour = b),
    signIn,
  };
}

describe("health", () => {
  it("live does not depend on dependencies", async () => {
    const { app, redis } = setup();
    redis.failing = true;
    await request(app).get("/api/health/live").expect(200, { status: "ok" });
  });

  it("ready reports degraded dependencies with 503", async () => {
    const { app, redis } = setup();
    await request(app).get("/api/health/ready").expect(200);
    redis.failing = true;
    const response = await request(app).get("/api/health/ready").expect(503);
    expect(response.body).toMatchObject({ status: "degraded", redis: "unavailable" });
  });

  it("propagates request ids", async () => {
    const { app } = setup();
    const response = await request(app)
      .get("/api/health/live")
      .set("X-Request-Id", "req-12345678");
    expect(response.headers["x-request-id"]).toBe("req-12345678");
  });
});

describe("auth", () => {
  it("issues an anonymous session with a CSRF token", async () => {
    const { app } = setup();
    const response = await request(app).get("/api/auth/session").expect(200);
    expect(response.body).toMatchObject({ authenticated: false, user: null });
    expect(response.body.csrfToken).toEqual(expect.any(String));
    expect(response.headers["set-cookie"]?.[0]).toMatch(/eleanor-session=.*HttpOnly/);
  });

  it("completes the login flow, records the user and rotates the session", async () => {
    const { app, users } = setup();
    const agent = request.agent(app);

    const login = await agent.get("/api/auth/login?returnTo=/settings").expect(302);
    expect(login.headers.location).toBe("http://idp.test/authorize?state=state");
    const before = login.headers["set-cookie"]?.[0];

    const callback = await agent.get("/api/auth/callback?code=abc&state=state").expect(302);
    expect(callback.headers.location).toBe(`${ORIGIN}/settings`);
    expect(callback.headers["set-cookie"]?.[0]).not.toBe(before);
    expect(users.logins).toEqual(["user-1"]);

    const session = await agent.get("/api/auth/session").expect(200);
    expect(session.body).toMatchObject({ authenticated: true, user: { id: "user-1" } });
  });

  it("supports forced re-authentication for signed-in users", async () => {
    const { app, oidc, signIn } = setup();
    const { cookie } = await signIn();

    const plain = await request(app).get("/api/auth/login").set("Cookie", cookie).expect(302);
    expect(plain.headers.location).toBe(`${ORIGIN}/assistant`);

    const forced = await request(app)
      .get("/api/auth/login?reauth=1")
      .set("Cookie", cookie)
      .expect(302);
    expect(forced.headers.location).toContain("idp.test");
    expect(oidc.forced).toEqual([true]);
  });

  it("refuses a re-authentication as a different account", async () => {
    const { app, oidc, signIn } = setup();
    const { cookie } = await signIn();
    await request(app).get("/api/auth/login?reauth=1").set("Cookie", cookie).expect(302);
    oidc.subject = "someone-else";
    await request(app).get("/api/auth/callback?code=x").set("Cookie", cookie).expect(409);
  });

  it("rejects a callback without a pending transaction", async () => {
    const { app } = setup();
    await request(app).get("/api/auth/callback?code=x").expect(400);
  });
});

describe("profile", () => {
  it("requires authentication", async () => {
    const { app } = setup();
    await request(app).get("/api/assistant-profile").expect(401);
  });

  it("requires a CSRF token for writes", async () => {
    const { app, signIn } = setup();
    const { cookie } = await signIn();
    await request(app)
      .put("/api/assistant-profile")
      .set("Cookie", cookie)
      .send({ metric: "1131380" })
      .expect(403);
  });

  it("saves and loads a valid metric", async () => {
    const { app, signIn } = setup();
    const { cookie, csrfToken } = await signIn();

    await request(app)
      .put("/api/assistant-profile")
      .set("Cookie", cookie)
      .set("X-CSRF-Token", csrfToken)
      .send({ metric: "1000005" })
      .expect(200);

    const response = await request(app)
      .get("/api/assistant-profile")
      .set("Cookie", cookie)
      .expect(200);
    expect(response.body.profile.metric).toBe("1000005");
  });

  it("rejects an out-of-range metric", async () => {
    const { app, signIn } = setup();
    const { cookie, csrfToken } = await signIn();
    await request(app)
      .put("/api/assistant-profile")
      .set("Cookie", cookie)
      .set("X-CSRF-Token", csrfToken)
      .send({ metric: "42" })
      .expect(400);
  });
});

describe("provider credentials", () => {
  it("requires a recent passkey step-up to store a key", async () => {
    const { app, signIn } = setup();
    const { cookie, csrfToken } = await signIn();
    const response = await request(app)
      .put("/api/provider-credentials")
      .set("Cookie", cookie)
      .set("X-CSRF-Token", csrfToken)
      .send({ provider: "openai", apiKey: "sk-test-0123456789abcdef" })
      .expect(428);
    expect(response.body.code).toBe("STEP_UP_REQUIRED");
  });

  it("stores a key after step-up and never returns it", async () => {
    const { app, signIn } = setup();
    const { cookie, csrfToken } = await signIn({ stepUp: true });

    await request(app)
      .put("/api/provider-credentials")
      .set("Cookie", cookie)
      .set("X-CSRF-Token", csrfToken)
      .send({ provider: "openai", apiKey: "sk-test-0123456789abcdef" })
      .expect(204);

    const status = await request(app)
      .get("/api/provider-credentials/status")
      .set("Cookie", cookie)
      .expect(200);
    expect(status.body).toEqual({ configured: true, provider: "openai" });

    const details = await request(app)
      .get("/api/provider-credentials/details")
      .set("Cookie", cookie)
      .expect(200);
    expect(JSON.stringify(details.body)).not.toContain("sk-test");
  });
});

describe("realtime", () => {
  async function withCredential(ctx: ReturnType<typeof setup>) {
    await ctx.credentials.save("user-1", "openai", "sk-test-0123456789abcdef");
    return ctx.signIn();
  }

  it("requires a configured provider credential", async () => {
    const ctx = setup();
    const { cookie, csrfToken } = await ctx.signIn();
    const response = await request(ctx.app)
      .post("/api/realtime/session")
      .set("Cookie", cookie)
      .set("X-CSRF-Token", csrfToken)
      .set("Content-Type", "application/sdp")
      .send(SDP_OFFER)
      .expect(409);
    expect(response.body.code).toBe("PROVIDER_CREDENTIAL_REQUIRED");
  });

  it("returns the provider SDP answer using the decrypted key", async () => {
    const ctx = setup();
    const { cookie, csrfToken } = await withCredential(ctx);
    const response = await request(ctx.app)
      .post("/api/realtime/session")
      .set("Cookie", cookie)
      .set("X-CSRF-Token", csrfToken)
      .set("Content-Type", "application/sdp")
      .set("X-Eleanor-Profile-Metric", "1131380")
      .send(SDP_OFFER)
      .expect(200);
    expect(response.headers["content-type"]).toMatch(/application\/sdp/);
    expect(response.text).toBe(SDP_ANSWER);
    expect(ctx.providerCalls).toEqual(["sk-test-0123456789abcdef"]);
  });

  it("rejects a malformed profile metric with 400, not 502", async () => {
    const ctx = setup();
    const { cookie, csrfToken } = await withCredential(ctx);
    const response = await request(ctx.app)
      .post("/api/realtime/session")
      .set("Cookie", cookie)
      .set("X-CSRF-Token", csrfToken)
      .set("Content-Type", "application/sdp")
      .set("X-Eleanor-Profile-Metric", "not-a-number")
      .send(SDP_OFFER)
      .expect(400);
    expect(response.body.code).toBe("INVALID_PROFILE_METRIC");
    expect(ctx.providerCalls).toEqual([]);
  });

  it("rejects a body that is not an SDP offer", async () => {
    const ctx = setup();
    const { cookie, csrfToken } = await withCredential(ctx);
    await request(ctx.app)
      .post("/api/realtime/session")
      .set("Cookie", cookie)
      .set("X-CSRF-Token", csrfToken)
      .set("Content-Type", "application/sdp")
      .send("hello")
      .expect(400);
  });

  it("maps a rejected provider key to a stable error code", async () => {
    const ctx = setup();
    ctx.setProvider("auth");
    const { cookie, csrfToken } = await withCredential(ctx);
    const response = await request(ctx.app)
      .post("/api/realtime/session")
      .set("Cookie", cookie)
      .set("X-CSRF-Token", csrfToken)
      .set("Content-Type", "application/sdp")
      .send(SDP_OFFER)
      .expect(502);
    expect(response.body.code).toBe("PROVIDER_AUTH_FAILED");
  });

  it("rate limits per user", async () => {
    const ctx = setup({ rateLimit: 2 });
    const { cookie, csrfToken } = await withCredential(ctx);
    const send = () =>
      request(ctx.app)
        .post("/api/realtime/session")
        .set("Cookie", cookie)
        .set("X-CSRF-Token", csrfToken)
        .set("Content-Type", "application/sdp")
        .send(SDP_OFFER);

    await send().expect(200);
    await send().expect(200);
    const third = await send().expect(429);
    expect(third.body.code).toBe("RATE_LIMITED");
  });
});

describe("errors", () => {
  it("returns 400 (not 500) for malformed JSON", async () => {
    const { app, signIn } = setup();
    const { cookie, csrfToken } = await signIn();
    await request(app)
      .put("/api/assistant-profile")
      .set("Cookie", cookie)
      .set("X-CSRF-Token", csrfToken)
      .set("Content-Type", "application/json")
      .send("{not json")
      .expect(400);
  });

  it("returns a JSON 404", async () => {
    const { app } = setup();
    const response = await request(app).get("/api/nope").expect(404);
    expect(response.body.code).toBe("NOT_FOUND");
  });
});
