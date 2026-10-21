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
