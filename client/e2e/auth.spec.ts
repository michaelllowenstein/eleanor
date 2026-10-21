import { expect, test } from "@playwright/test";

import { mockApi } from "./support/mock-api";

test("anonymous users are redirected to sign in", async ({ page }) => {
  await mockApi(page, { authenticated: false });
  await page.goto("/assistant");

  await expect(page).toHaveURL(/\/login\?returnUrl=%2Fassistant/);
  await expect(page.getByRole("button", { name: "Continue securely" })).toBeVisible();
});

test("signed-in users skip the login page", async ({ page }) => {
  await mockApi(page);
  await page.goto("/login");
  await expect(page).toHaveURL(/\/assistant$/);
});

test("legacy /home links land on the assistant", async ({ page }) => {
  await mockApi(page);
  await page.goto("/home");
  await expect(page).toHaveURL(/\/assistant$/);
});
