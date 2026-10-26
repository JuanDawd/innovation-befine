import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  asRole,
  chargeInCash,
  closeDay,
  containing,
  cop,
  E2E_SERVICE,
  E2E_STYLIST,
  ensureDayOpen,
  guestName,
  logGuestTicket,
  markReady,
  voidAllUnpaid,
} from "./helpers/flows";

/**
 * Payroll settlement E2E (M-71): a paid service earns the stylist its
 * commission ($50.000 × 40 % = $20.000 per ticket); paying "through today"
 * records the payout and leaves no unsettled days, so the same days can't be
 * paid twice.
 *
 * Only closed business days can be settled, so this spec closes the day. It
 * runs in the "settlement" project, after every other spec (playwright.config).
 */

test.describe("payroll settlement", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });
  // Multi-role flow (secretary logs, admin charges, admin pays) — slower than 30 s.
  test.describe.configure({ timeout: 90_000 });

  test("pays a stylist's commission once and settles the period", async ({ page, browser }) => {
    const guest = guestName("Nomina");
    await ensureDayOpen(page);

    const secretary = await asRole(browser, "secretary");
    await logGuestTicket(secretary.page, guest);
    await secretary.context.close();
    await markReady(page, guest);
    await chargeInCash(page, guest, E2E_SERVICE.price);

    // Leftovers from other specs (e.g. ticket-lifecycle's logged ticket) block the close (H-49).
    await voidAllUnpaid(page);
    await closeDay(page);

    await page.goto("/admin/payroll");
    const employee = page.getByRole("combobox", { name: "Seleccionar empleado…" });
    await employee.selectOption({ label: `${E2E_STYLIST} (Estilista)` });
    // Selecting pushes ?employeeId=…; acting before that navigation lands
    // gets the preview reset when the page re-renders.
    await expect(page).toHaveURL(/employeeId=/);

    await page.getByRole("button", { name: "Pagar hasta hoy" }).click();
    const review = page
      .getByRole("heading", { name: "3. Revisa y confirma el pago" })
      .locator("..");
    await expect(review).toBeVisible({ timeout: 15_000 });

    // Every paid E2E Corte line earns exactly the commission; the total is their sum
    // (earlier runs on the same database may have left more unpaid lines).
    const lines = review.getByText(`${E2E_SERVICE.name} · `);
    await expect(lines.first()).toBeVisible();
    const lineCount = await lines.count();
    expect(lineCount).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < lineCount; i++) {
      // label → name/basis column → row, which holds the amount
      await expect(lines.nth(i).locator("../..")).toContainText(cop(E2E_SERVICE.commission));
    }
    await expect(review.getByText("Total calculado").locator("..")).toContainText(
      cop(E2E_SERVICE.commission * lineCount),
    );
    await expect(page.locator("#adjustedAmount")).toHaveValue(
      String(E2E_SERVICE.commission * lineCount),
    );

    const a11y = await new AxeBuilder({ page }).include("main").analyze();
    expect(
      a11y.violations.filter((v) => v.impact === "critical" || v.impact === "serious"),
    ).toEqual([]);

    await review.getByRole("button", { name: "Confirmar pago" }).click();
    // Title restates the payout: "¿Pagar $X a <name> en efectivo?"
    const confirmName = containing(
      `¿Pagar ${cop(E2E_SERVICE.commission * lineCount)} a ${E2E_STYLIST}`,
    );
    const confirm = page
      .getByRole("alertdialog", { name: confirmName })
      .or(page.getByRole("dialog", { name: confirmName }));
    await confirm.getByRole("button", { name: "Confirmar pago" }).click();
    await expect(page.getByText("Pago registrado correctamente")).toBeVisible({ timeout: 15_000 });

    // Settled: nothing left to pay for this stylist, so no second payout is possible.
    await page.goto("/admin/payroll");
    await page
      .getByRole("combobox", { name: "Seleccionar empleado…" })
      .selectOption({ label: `${E2E_STYLIST} (Estilista)` });
    await expect(page.getByText("No hay días laborales sin liquidar.")).toBeVisible({
      timeout: 15_000,
    });
  });
});
