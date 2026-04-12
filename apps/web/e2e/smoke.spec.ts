import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("smoke tests", () => {
  test("home page loads with correct title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle("Innovation Befine");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Innovation Befine");
  });

  test("home page displays all role buttons", async ({ page }) => {
    await page.goto("/");
    // aria-label matches the role key, visible text is the translated label
    const roles = ["cashier_admin", "secretary", "stylist", "clothier"];
    for (const role of roles) {
      await expect(page.getByRole("button", { name: role })).toBeVisible();
    }
  });

  test("home page passes accessibility checks", async ({ page }) => {
    await page.goto("/");
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
