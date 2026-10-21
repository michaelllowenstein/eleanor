import type { Page, Request } from "@playwright/test";

export interface MockState {
  authenticated?: boolean;
  passkeyRegistered?: boolean;
  providerConfigured?: boolean;
  profileMetric?: string | null;
  /** Error returned by POST /api/passkeys/registration/options, if any. */
  registrationOptionsError?: { status: number; code: string; error: string };
}

export interface MockApi {
  readonly profilePuts: string[];
  readonly unmocked: string[];
}

const json = (body: unknown, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(body),
});

/**
 * Installs deterministic API responses. Anything not handled returns 404 and
 * is recorded in `unmocked` so tests can assert nothing unexpected was hit.
 */
export async function mockApi(page: Page, state: MockState = {}): Promise<MockApi> {
  const api: MockApi = { profilePuts: [], unmocked: [] };
  const s = {
    authenticated: true,
    passkeyRegistered: true,
    providerConfigured: true,
    profileMetric: "1131380",
    ...state,
  };

  // Registered first => lowest precedence.
  await page.route("**/api/**", (route) => {
    api.unmocked.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
    return route.fulfill(json({ error: "Not mocked", code: "NOT_FOUND" }, 404));
  });

  await page.route("**/api/auth/session", (route) =>
    route.fulfill(
      json({
        authenticated: s.authenticated,
        user: s.authenticated ? { id: "user-test", name: "Test User" } : null,
        csrfToken: "test-csrf",
        authenticatedAt: s.authenticated ? Date.now() : null,
      }),
    ),
  );

  await page.route("**/api/passkeys/status", (route) =>
    route.fulfill(
      json({
        registered: s.passkeyRegistered,
        count: s.passkeyRegistered ? 1 : 0,
        stepUpVerifiedAt: null,
      }),
    ),
  );

  await page.route("**/api/passkeys/registration/options", (route) =>
    s.registrationOptionsError
      ? route.fulfill(
          json(
            { error: s.registrationOptionsError.error, code: s.registrationOptionsError.code },
            s.registrationOptionsError.status,
          ),
        )
      : route.fulfill(json({ error: "Not mocked" }, 500)),
  );

  await page.route("**/api/provider-credentials/status", (route) =>
    route.fulfill(
      json({
        configured: s.providerConfigured,
        provider: s.providerConfigured ? "openai" : null,
      }),
    ),
  );

  await page.route("**/api/assistant-profile", (route) => {
    const request: Request = route.request();
    if (request.method() === "PUT") {
      const body = request.postDataJSON() as { metric: string };
      api.profilePuts.push(body.metric);
      s.profileMetric = body.metric;
    }
    return route.fulfill(
      json({
        profile: s.profileMetric
          ? { metric: s.profileMetric, schemaVersion: 1, updatedAt: new Date().toISOString() }
          : null,
      }),
    );
  });

  return api;
}
