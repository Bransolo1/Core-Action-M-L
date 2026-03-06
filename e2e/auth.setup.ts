/**
 * Auth setup — logs in as admin and saves session to storage state.
 * All tests that require auth use the saved state via storageState.
 */
import { test as setup, expect } from "@playwright/test";
import path from "path";

export const authFile = path.join(__dirname, ".auth/user.json");

setup("authenticate", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(process.env.SEED_ADMIN_EMAIL ?? "admin@ridecore.pro");
  await page.getByLabel("Password").fill(process.env.SEED_ADMIN_PASSWORD ?? "CoreAction2026!");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL("/dashboard");
  await page.context().storageState({ path: authFile });
});
