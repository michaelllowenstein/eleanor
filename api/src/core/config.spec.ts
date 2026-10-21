import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import { ConfigError, loadConfig } from "./config.js";

const base = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://eleanor:eleanor@localhost:5432/eleanor",
  REDIS_URL: "redis://localhost:6379",
  PUBLIC_ORIGIN: "http://localhost:4200",
  OIDC_ISSUER: "http://localhost:8080/eleanor",
  OIDC_CLIENT_ID: "eleanor-local",
  OIDC_CLIENT_SECRET: "secret",
  WEBAUTHN_RP_ID: "localhost",
  CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
};

describe("loadConfig", () => {
  it("accepts the documented local configuration", () => {
    const config = loadConfig(base);
    expect(config.publicOrigin).toBe("http://localhost:4200");
    expect(config.stepUpTtlSeconds).toBe(300);
    expect(config.realtimeModel).toBe("gpt-realtime-2.1");
  });

  it("reports every problem at once", () => {
    try {
      loadConfig({ NODE_ENV: "development" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).problems.length).toBeGreaterThanOrEqual(8);
    }
  });

  it("requires https origins in production", () => {
    expect(() => loadConfig({ ...base, NODE_ENV: "production" })).toThrow(/https/);
  });

  it("rejects an RP ID that does not match the origin", () => {
    expect(() =>
      loadConfig({ ...base, WEBAUTHN_RP_ID: "eleanor.ca" }),
    ).toThrow(/WEBAUTHN_RP_ID/);
  });

  it("accepts a parent-domain RP ID", () => {
    const config = loadConfig({
      ...base,
      NODE_ENV: "production",
      PUBLIC_ORIGIN: "https://app.eleanor.ca",
      OIDC_ISSUER: "https://id.example.com/",
      WEBAUTHN_RP_ID: "eleanor.ca",
    });
    expect(config.webauthnRpId).toBe("eleanor.ca");
  });

  it("rejects a short encryption key", () => {
    expect(() =>
      loadConfig({ ...base, CREDENTIAL_ENCRYPTION_KEY: randomBytes(16).toString("base64") }),
    ).toThrow(/32 bytes/);
  });

  it("rejects an origin with a path", () => {
    expect(() => loadConfig({ ...base, PUBLIC_ORIGIN: "http://localhost:4200/app" })).toThrow();
  });
});
