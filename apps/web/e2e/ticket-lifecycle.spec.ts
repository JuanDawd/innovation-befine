import { test, expect } from "@playwright/test";

/**
 * Ticket lifecycle E2E — log service → awaiting_payment → checkout.
 *
 * Secretary creates a ticket for a guest client, transitions it to awaiting
 * payment, then admin/cashier verifies the cashier dashboard loads.
 *
 * Requires a seeded DB with at least one active stylist and one active service.
 */

test.describe("ticket lifecycle", () => {
  test.use({ storageState: "e2e/.auth/secretary.json" });
  test.describe.configure({ mode: "serial" });

  test("secretary creates a ticket via Log Service dialog", async ({ page }) => {
    await page.goto("/secretary");

    // Open LogServiceDialog — both sidebar and page have this button; target the main one
    const buttons = page.getByRole("button", { name: /registrar servicio/i });
    const count = await buttons.count();
    await buttons.nth(count - 1).click();

    // Wait for dialog and form to load (fetches employee ID + services via server actions)
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Wait for stylist options to load (options inside <select> are hidden in Playwright — poll count)
    const employeeSelect = page.locator("#ls-employee");
    await expect(employeeSelect).toBeEnabled({ timeout: 10_000 });
    await expect
      .poll(() => employeeSelect.locator("option").count(), { timeout: 10_000 })
      .toBeGreaterThan(1);
    await employeeSelect.selectOption({ index: 1 });

    // Wait for service options to load
    const serviceSelect = page.locator("#ls-service");
    await expect(serviceSelect).toBeEnabled({ timeout: 10_000 });
    await expect
      .poll(() => serviceSelect.locator("option").count(), { timeout: 10_000 })
      .toBeGreaterThan(1);
    await serviceSelect.selectOption({ index: 1 });

    // Variant select appears conditionally after service is selected
    const variantSelect = page.locator("#ls-variant");
    await expect(variantSelect).toBeAttached({ timeout: 5_000 });
    await expect
      .poll(() => variantSelect.locator("option").count(), { timeout: 5_000 })
      .toBeGreaterThan(1);
    await variantSelect.selectOption({ index: 1 });

    // Select guest client via ClientSearchWidget: click "Invitado / Walk-in" button
    await page.getByRole("button", { name: /invitado|walk-in/i }).click();
    // Type guest name in the input that appears
    const guestInput = page.locator('input[placeholder*="Juan"]');
    await guestInput.fill("Test E2E");
    // Confirm the guest selection
    await page.getByRole("button", { name: /confirmar|confirm/i }).click();

    // Submit should now be enabled
    await expect(dialog.getByRole("button", { name: /registrar ticket/i })).toBeEnabled({
      timeout: 3_000,
    });
    await dialog.getByRole("button", { name: /registrar ticket/i }).click();

    // Verify success toast
    await expect(page.getByText(/ticket registrado correctamente/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("admin can access the cashier dashboard", async ({ browser }) => {
    const adminContext = await browser.newContext({ storageState: "e2e/.auth/admin.json" });
    const adminPage = await adminContext.newPage();

    await adminPage.goto("/cashier", { waitUntil: "domcontentloaded" });
    await expect(adminPage).not.toHaveURL(/login/);
    await expect(adminPage.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15_000 });

    await adminContext.close();
  });
});
