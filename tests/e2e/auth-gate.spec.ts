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
