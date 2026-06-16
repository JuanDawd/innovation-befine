import { test, expect } from "@playwright/test";

/**
 * Appointment booking E2E — secretary books an appointment.
 *
 * Verifies the full booking dialog flow: client (guest), stylist selection,
 * service summary, datetime, duration → submit → success toast.
 *
 * Requires a seeded DB with at least one active stylist.
 */

test.describe("appointment booking", () => {
  test.use({ storageState: "e2e/.auth/secretary.json" });

  test("secretary can book an appointment via the dialog", async ({ page }) => {
    await page.goto("/secretary/appointments");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Open booking dialog
    await page.getByRole("button", { name: /nueva cita/i }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Select guest client via ClientSearchWidget
    await dialog.getByRole("button", { name: /invitado|walk-in/i }).click();
    const guestInput = dialog.locator('input[placeholder*="Juan"]');
    await guestInput.fill("Test E2E");
    await dialog.getByRole("button", { name: /confirmar|confirm/i }).click();

    // Select first available stylist (options inside <select> are always hidden in Playwright)
    const stylistSelect = page.locator("#apt-stylist");
    await expect(stylistSelect).toBeEnabled({ timeout: 10_000 });
    await expect
      .poll(() => stylistSelect.locator("option").count(), { timeout: 10_000 })
      .toBeGreaterThan(1);
    await stylistSelect.selectOption({ index: 1 });

    // Fill service summary (free text)
    await page.locator("#apt-service").fill("Corte de cabello — test E2E");

    // Fill datetime — pick a unique future slot per run to avoid CONFLICT from previous runs
    // leaving appointments in the shared test DB. Epoch-seconds mod gives a cycle of 180 unique
    // days (60–240 days out) and 22 unique hours, so each second of clock time gets a fresh slot.
    const secondsNow = Math.floor(Date.now() / 1000);
    const daysOffset = 60 + (secondsNow % 180);
    const uniqueHour = 1 + (secondsNow % 22);
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysOffset);
    targetDate.setHours(uniqueHour, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    const datetimeValue = `${targetDate.getFullYear()}-${pad(targetDate.getMonth() + 1)}-${pad(targetDate.getDate())}T${pad(uniqueHour)}:00`;
    await page.locator("#apt-datetime").fill(datetimeValue);

    // Duration already defaulted to 60 in form state
    await page.locator("#apt-duration").fill("60");

    // Submit
    await dialog.getByRole("button", { name: /reservar cita/i }).click();

    // Verify success toast ("Cita reservada correctamente")
    await expect(page.getByText(/cita reservada correctamente/i)).toBeVisible({ timeout: 10_000 });
  });
});
