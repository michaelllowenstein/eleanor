import { expect, test } from "@playwright/test";

import { mockApi } from "./support/mock-api";

test("changing a setting persists the new profile metric to the account", async ({ page }) => {
  const api = await mockApi(page);
  await page.goto("/settings");

  await page.getByRole("radio", { name: "Witty" }).click();
  await expect(page.getByRole("radio", { name: "Witty" })).toHaveAttribute("aria-checked", "true");

  // Default 1131380 with personality index 0 -> 2.
  await expect.poll(() => api.profilePuts.at(-1)).toBe("1131382");
  await expect(page.getByText("Sync: saved")).toBeVisible();
});

test("the account profile is applied when the assistant loads", async ({ page }) => {
  await mockApi(page, { profileMetric: "1155519" });
  await page.goto("/assistant");
  await page.getByRole("link", { name: "Settings" }).click();

  await expect(page.getByRole("radio", { name: "Direct" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("radio", { name: "Cedar" })).toHaveAttribute("aria-checked", "true");
});
