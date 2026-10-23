import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// The tenant root is the staff entry point; the public sales page lives in apps/site.
test.describe("entry smoke tests", () => {
  test("root redirects to sign-in", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });

  test("sign-in page has its heading and form", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("input[type=email]")).toBeVisible();
    await expect(page.locator("input[type=password]")).toBeVisible();
    await expect(page.locator("button[type=submit]")).toBeVisible();
  });

  test("sign-in page passes accessibility checks", async ({ page }) => {
    await page.goto("/login");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .disableRules(["color-contrast"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
