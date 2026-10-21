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
