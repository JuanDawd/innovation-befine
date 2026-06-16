import { test, expect } from "@playwright/test";

/**
 * Authenticated role access smoke tests.
 *
 * Each role must be able to log in and reach their home page.
 * Also verifies that cross-role access is blocked (403 redirect).
 *
 * Auth state is pre-created by e2e/setup/auth.setup.ts so login doesn't
 * run again here — each test starts with a valid session cookie.
 */

test.describe("admin role access", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("lands on admin home after login", async ({ page }) => {
    await page.goto("/admin/analytics");
    await expect(page).not.toHaveURL(/login/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("admin can access /cashier (cross-role allowed)", async ({ page }) => {
    await page.goto("/cashier", { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/login|403/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15_000 });
  });

  test("admin cannot access /secretary (middleware rewrites to 403)", async ({ page }) => {
    await page.goto("/secretary");
    // Middleware uses NextResponse.rewrite — URL stays the same but content is 403 page
    await expect(page.getByRole("heading", { name: /acceso denegado/i })).toBeVisible();
  });
});

test.describe("secretary role access", () => {
  test.use({ storageState: "e2e/.auth/secretary.json" });

  test("lands on secretary home after login", async ({ page }) => {
    await page.goto("/secretary");
    await expect(page).not.toHaveURL(/login/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("secretary can access /secretary/appointments", async ({ page }) => {
    await page.goto("/secretary/appointments");
    await expect(page).not.toHaveURL(/login/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("secretary cannot access /admin routes (middleware rewrites to 403)", async ({ page }) => {
    await page.goto("/admin/employees");
    await expect(page.getByRole("heading", { name: /acceso denegado/i })).toBeVisible();
  });
});

test.describe("stylist role access", () => {
  test.use({ storageState: "e2e/.auth/stylist.json" });

  test("lands on stylist home after login", async ({ page }) => {
    await page.goto("/stylist");
    await expect(page).not.toHaveURL(/login/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("stylist cannot access /admin routes (middleware rewrites to 403)", async ({ page }) => {
    await page.goto("/admin/employees");
    await expect(page.getByRole("heading", { name: /acceso denegado/i })).toBeVisible();
  });
});

test.describe("clothier role access", () => {
  test.use({ storageState: "e2e/.auth/clothier.json" });

  test("lands on clothier home after login", async ({ page }) => {
    await page.goto("/clothier");
    await expect(page).not.toHaveURL(/login/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("clothier cannot access /secretary routes (middleware rewrites to 403)", async ({
    page,
  }) => {
    await page.goto("/secretary");
    await expect(page.getByRole("heading", { name: /acceso denegado/i })).toBeVisible();
  });
});
