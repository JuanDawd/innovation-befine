import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe.skip("landing smoke tests", () => {
  test("landing loads with correct title and hero", async ({ page }) => {
    await page.goto("/");

    // Title
    await expect(page).toHaveTitle(/Innovation Befine/i);

    // Hero heading (h1 exists)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Hero paragraph
    await expect(page.locator("p").first()).toBeVisible();
  });

  test("primary CTA navigates to login", async ({ page }) => {
    await page.goto("/");

    const cta = page.getByRole("link", { name: /login|cta/i });
    await expect(cta).toBeVisible();

    await cta.click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("features section renders", async ({ page }) => {
    await page.goto("/");

    // Expect 3 feature cards
    const features = page.locator("h2");
    await expect(features).toHaveCount(3);
  });

  test("landing passes accessibility checks", async ({ page }) => {
    await page.goto("/");

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
