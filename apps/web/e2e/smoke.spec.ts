import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("landing smoke tests", () => {
  test("landing loads with correct title and hero", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/Innovation Befine/i);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("main p").first()).toBeVisible();
  });

  test("primary CTA navigates to login", async ({ page }) => {
    await page.goto("/");

    const cta = page.locator('main a[href="/login"]').first();
    await expect(cta).toBeVisible();

    await cta.click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("features section renders", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 2 })).toHaveCount(3);
  });

  test("landing passes accessibility checks", async ({ page }) => {
    await page.goto("/");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .disableRules(["color-contrast"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
