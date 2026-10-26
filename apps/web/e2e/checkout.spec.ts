import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  asRole,
  containing,
  cop,
  E2E_SERVICE,
  ensureDayOpen,
  guestName,
  logGuestTicket,
  markReady,
} from "./helpers/flows";

/**
 * Checkout lifecycle E2E (M-71): logged → awaiting_payment → paid, the
 * close-day guard for unpaid tickets (H-49), and voiding a walk-out ticket.
 */

test.describe("checkout", () => {
  // Multi-role flows (secretary logs, admin charges) — slower than the 30 s default.
  test.describe.configure({ mode: "serial", timeout: 90_000 });
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("charges an awaiting ticket in cash and removes it from the board", async ({
    page,
    browser,
  }) => {
    const guest = guestName("Pago");
    await ensureDayOpen(page);

    const secretary = await asRole(browser, "secretary");
    await logGuestTicket(secretary.page, guest);
    await secretary.context.close();

    await markReady(page, guest);
    await page.getByRole("link", { name: containing(`Cobrar a ${guest}`) }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(guest).first()).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText("Total a cobrar").locator("..")).toContainText(
      cop(E2E_SERVICE.price),
    );

    // Before filling the amount: the submit button's enable transition would
    // otherwise be sampled mid-fade by the contrast check.
    const a11y = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
    expect(
      a11y.violations.filter((v) => v.impact === "critical" || v.impact === "serious"),
    ).toEqual([]);

    await dialog.getByRole("button", { name: "Restante" }).first().click();
    await expect(
      dialog
        .getByRole("textbox", { name: "Monto" })
        .or(dialog.getByRole("spinbutton", { name: "Monto" }))
        .first(),
    ).toHaveValue(cop(E2E_SERVICE.price).slice(1)); // MoneyInput shows "50.000", no sign

    await dialog.getByRole("button", { name: "Confirmar cobro" }).click();
    const confirm = page.getByRole("dialog", {
      name: containing(`Cobrar ${cop(E2E_SERVICE.price)} a ${guest}`),
    });
    await confirm.getByRole("button", { name: "Confirmar" }).click();

    await expect(page.getByText("Pago registrado correctamente")).toBeVisible({ timeout: 15_000 });

    await page.goto("/cashier");
    await expect(page.getByRole("link", { name: containing(`Cobrar a ${guest}`) })).toHaveCount(0);
  });

  test("adjusting a price keeps Cobrar open and updates the total (M-70)", async ({
    page,
    browser,
  }) => {
    const guest = guestName("Ajuste");
    await ensureDayOpen(page);
    const secretary = await asRole(browser, "secretary");
    await logGuestTicket(secretary.page, guest);
    await secretary.context.close();
    await markReady(page, guest);

    await page.getByRole("link", { name: containing(`Cobrar a ${guest}`) }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(guest).first()).toBeVisible({ timeout: 15_000 });
    const total = dialog.getByText("Total a cobrar").locator("..");
    await expect(total).toContainText(cop(E2E_SERVICE.price));

    // This guest's group only — the dialog lists every awaiting ticket.
    const group = dialog
      .getByRole("checkbox", { name: containing(guest) })
      .locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
    await group.getByRole("button", { name: "Ajustar" }).click();
    await group.getByLabel("Nuevo precio").fill("42000");
    await group.getByLabel("Motivo del ajuste").fill("Descuento de prueba");
    await group.getByRole("button", { name: "Guardar" }).click();

    await expect(page.getByText(`Precio ajustado a ${cop(42_000)}`)).toBeVisible({
      timeout: 10_000,
    });
    // Same dialog, new total — no reopening Cobrar
    await expect(dialog).toBeVisible();
    await expect(total).toContainText(cop(42_000));
    // Persisted: the board card now charges the adjusted amount
    await page.goto("/cashier");
    await expect(
      page.getByRole("link", {
        name: containing(`Cobrar a ${guest}: ${E2E_SERVICE.name}, ${cop(42_000)}`),
      }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("can't close the day while a ticket is unpaid; a walk-out ticket can be voided", async ({
    page,
    browser,
  }) => {
    const guest = guestName("Anular");
    await ensureDayOpen(page);

    const secretary = await asRole(browser, "secretary");
    await logGuestTicket(secretary.page, guest);
    await secretary.context.close();

    await page.goto("/cashier");
    await page.getByRole("button", { name: "Cerrar día", exact: true }).click();
    const closeDialog = page.getByRole("dialog", { name: "¿Cerrar el día?" });
    await expect(closeDialog.getByRole("button", { name: /Ir a cobrar/ })).toBeVisible({
      timeout: 15_000,
    });
    // No way to close from here while tickets are unpaid
    await expect(closeDialog.getByRole("button", { name: "Cerrar día", exact: true })).toHaveCount(
      0,
    );
    await closeDialog.getByRole("button", { name: "Cancelar" }).click();

    await page.getByRole("button", { name: `Anular ticket de ${guest}` }).click();
    const voidDialog = page.getByRole("dialog", { name: `¿Anular el ticket de ${guest}?` });
    await voidDialog.getByRole("button", { name: "Anular ticket" }).click();
    await expect(voidDialog.getByText(/al menos 5 caracteres/)).toBeVisible();
    await voidDialog.getByLabel("Motivo").fill("Se fue sin pagar (E2E)");
    await voidDialog.getByRole("button", { name: "Anular ticket" }).click();

    await expect(page.getByText(`Ticket de ${guest} anulado`)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: `Anular ticket de ${guest}` })).toHaveCount(0);
  });
});
