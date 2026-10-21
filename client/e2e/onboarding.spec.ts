import { expect, test } from "@playwright/test";

import { mockApi } from "./support/mock-api";

test("a user without a passkey must create one first", async ({ page }) => {
  await mockApi(page, { passkeyRegistered: false, providerConfigured: false });
  await page.goto("/assistant");

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Add a passkey." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Activate" })).toHaveCount(0);

  // Escape must not dismiss a mandatory setup step.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
});

test("an expired sign-in offers re-authentication instead of a dead end", async ({ page }) => {
  await mockApi(page, {
    passkeyRegistered: false,
    providerConfigured: false,
    registrationOptionsError: {
      status: 428,
      code: "RECENT_LOGIN_REQUIRED",
      error: "Sign in again before enrolling the first passkey.",
    },
  });
  await page.goto("/assistant");

  await page.getByRole("button", { name: "Create passkey" }).click();
  await expect(page.getByRole("button", { name: "Sign in again" })).toBeVisible();
});

test("a user with a passkey but no provider key must connect a provider", async ({ page }) => {
  await mockApi(page, { passkeyRegistered: true, providerConfigured: false });
  await page.goto("/assistant");

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Connect Eleanor." })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Connect provider" })).toBeDisabled();

  await dialog.getByLabel("API key").fill("sk-test-0123456789abcdef");
  await expect(dialog.getByRole("button", { name: "Connect provider" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Activate" })).toHaveCount(0);
});

test("a fully set-up user can activate the assistant", async ({ page }) => {
  const api = await mockApi(page);
  await page.goto("/assistant");

  await expect(page.getByRole("heading", { name: "ELEANOR" })).toBeVisible();
  await expect(page.getByText("Assistant offline")).toBeVisible();
  await expect(page.getByRole("button", { name: "Activate" })).toBeEnabled();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(api.unmocked).toEqual([]);
});

test("a denied microphone shows an error without crashing", async ({ page }) => {
  await mockApi(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          throw new DOMException("Microphone permission denied", "NotAllowedError");
        },
      },
    });
  });

  await page.goto("/assistant");
  await page.getByRole("button", { name: "Activate" }).click();

  await expect(page.getByText("Connection error")).toBeVisible();
  await expect(page.getByText("Microphone permission denied")).toBeVisible();
  await expect(page.getByRole("button", { name: "Activate" })).toBeEnabled();
});
