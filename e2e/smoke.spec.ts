/**
 * Smoke tests — critical user journeys.
 * These run against a seeded database.
 */
import { test, expect } from "@playwright/test";
import { authFile } from "./auth.setup";

test.use({ storageState: authFile });

test.describe("Navigation", () => {
  test("all nav links are accessible", async ({ page }) => {
    const links = [
      ["/dashboard", "Dashboard"],
      ["/products", "Products"],
      ["/sales", "Sales History"],
      ["/forecasting", "Forecasting"],
      ["/purchase-orders", "Purchase Orders"],
      ["/suppliers", "Suppliers"],
      ["/import", "Import Data"],
      ["/settings", "Settings"],
    ];

    for (const [url, title] of links) {
      await page.goto(url);
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
    }
  });
});

test.describe("Products", () => {
  test("can add a product", async ({ page }) => {
    await page.goto("/products");
    await page.getByRole("button", { name: /add product/i }).click();
    await page.getByLabel("SKU *").fill("TEST-E2E-001");
    await page.getByLabel("Product Name *").fill("E2E Test Product");
    await page.locator("select#category").selectOption("Skateboarding");
    await page.getByRole("button", { name: /save product/i }).click();
    await expect(page.getByText("TEST-E2E-001")).toBeVisible();
  });
});

test.describe("Auth", () => {
  test("unauthenticated users are redirected to login", async ({ browser }) => {
    const context = await browser.newContext(); // fresh context, no auth
    const page = await context.newPage();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    await context.close();
  });

  test("login page has email + password fields", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/login");
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await context.close();
  });
});

test.describe("Health", () => {
  test("/api/health returns 200", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const body = await res.json() as { status: string };
    expect(body.status).toBe("healthy");
  });
});
