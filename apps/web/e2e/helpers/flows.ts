import { expect, type Browser, type Page } from "@playwright/test";

/**
 * Shared E2E flows (M-71). Specs run against the throwaway database from
 * e2e/db/compose.yaml, seeded by packages/db/src/seed.ts + seed-e2e.ts:
 *   stylist "Estilista" (hairdresser@befine.dev), service "E2E Corte" /
 *   "Estándar" at $50.000 with 40 % commission.
 */

export const E2E_SERVICE = { name: "E2E Corte", price: 50_000, commission: 20_000 } as const;
export const E2E_STYLIST = "Estilista";

/** Unique guest name so specs don't see each other's tickets. */
export function guestName(prefix: string): string {
  return `${prefix} ${Date.now().toString(36)}`;
}

/** COP the way formatMoney renders it: $50.000 */
export function cop(amount: number): string {
  return `$${amount.toLocaleString("es-CO")}`;
}

export async function asRole(browser: Browser, role: "admin" | "secretary" | "stylist") {
  const context = await browser.newContext({ storageState: `e2e/.auth/${role}.json` });
  const page = await context.newPage();
  return { context, page };
}

/** Cashier/admin page: open the business day unless one is already open. */
export async function ensureDayOpen(page: Page): Promise<void> {
  await page.goto("/cashier");
  const open = page.getByRole("button", { name: "Abrir día", exact: true });
  const close = page.getByRole("button", { name: "Cerrar día", exact: true });
  await expect(open.or(close).first()).toBeVisible({ timeout: 15_000 });
  if (await open.isVisible()) {
    await open.click();
    await expect(close).toBeVisible({ timeout: 15_000 });
  }
}

/** Secretary logs one E2E Corte for a guest through the "Registrar servicio" dialog. */
export async function logGuestTicket(page: Page, guest: string): Promise<void> {
  await page.goto("/secretary");
  const buttons = page.getByRole("button", { name: /registrar servicio/i });
  await buttons.nth((await buttons.count()) - 1).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  const employee = page.locator("#ls-employee");
  await expect(employee).toBeEnabled({ timeout: 10_000 });
  await expect
    .poll(() => employee.locator("option").count(), { timeout: 10_000 })
    .toBeGreaterThan(1);
  await employee.selectOption({ label: E2E_STYLIST });

  const service = page.locator("#ls-service");
  await expect
    .poll(() => service.locator("option").count(), { timeout: 10_000 })
    .toBeGreaterThan(1);
  await service.selectOption({ label: E2E_SERVICE.name });

  const variant = page.locator("#ls-variant");
  await expect.poll(() => variant.locator("option").count(), { timeout: 5_000 }).toBeGreaterThan(1);
  await variant.selectOption({ index: 1 });

  await page.getByRole("button", { name: /invitado|walk-in/i }).click();
  await page.locator('input[placeholder*="Juan"]').fill(guest);
  await page.getByRole("button", { name: /confirmar|confirm/i }).click();

  const submit = dialog.getByRole("button", { name: /registrar ticket/i });
  await expect(submit).toBeEnabled({ timeout: 3_000 });
  await submit.click();
  await expect(page.getByText(/ticket registrado correctamente/i)).toBeVisible({ timeout: 10_000 });
}

/** Cashier board: move the guest's logged ticket to "Por cobrar". */
export async function markReady(page: Page, guest: string): Promise<void> {
  await page.goto("/cashier");
  await page
    .getByRole("button", { name: new RegExp(`Marcar listo para cobrar: ${guest}`) })
    .click({ timeout: 15_000 });
  await expect(page.getByRole("link", { name: new RegExp(`Cobrar a ${guest}`) })).toBeVisible({
    timeout: 15_000,
  });
}

/** Cashier: charge the guest's awaiting ticket in full, in cash. */
export async function chargeInCash(page: Page, guest: string, amount: number): Promise<void> {
  await page.goto("/cashier");
  await page.getByRole("link", { name: new RegExp(`Cobrar a ${guest}`) }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(guest).first()).toBeVisible({ timeout: 15_000 });
  await dialog.getByRole("button", { name: "Restante" }).first().click();
  await dialog.getByRole("button", { name: "Confirmar cobro" }).click();
  const confirm = page.getByRole("dialog", {
    name: new RegExp(`Cobrar \\${cop(amount)} a ${guest}`),
  });
  await confirm.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByText("Pago registrado correctamente")).toBeVisible({ timeout: 15_000 });
}

/**
 * Cashier board: void every unpaid ticket still on it. Only for the
 * end-of-run settlement project, after all other specs finished — it would
 * void tickets other specs are still using.
 */
export async function voidAllUnpaid(page: Page): Promise<void> {
  await page.goto("/cashier");
  const voidButtons = page.getByRole("button", { name: /^Anular ticket de / });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15_000 });
  let remaining = await voidButtons.count();
  while (remaining > 0) {
    const name = (await voidButtons.first().getAttribute("aria-label")) ?? "";
    const client = name.replace("Anular ticket de ", "");
    await voidButtons.first().click();
    const dialog = page.getByRole("dialog", { name: `¿Anular el ticket de ${client}?` });
    await dialog.getByLabel("Motivo").fill("Limpieza E2E antes de cerrar el día");
    await dialog.getByRole("button", { name: "Anular ticket" }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    // Wait for the board refetch to drop the card before picking the next one
    // (guest names can repeat, so count rather than match by name).
    await expect(voidButtons).toHaveCount(remaining - 1, { timeout: 15_000 });
    remaining -= 1;
  }
}

/** Cashier: close the open business day (requires no unpaid tickets). */
export async function closeDay(page: Page): Promise<void> {
  await page.goto("/cashier");
  await page.getByRole("button", { name: "Cerrar día", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "¿Cerrar el día?" });
  await dialog.getByRole("button", { name: "Cerrar día", exact: true }).click({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Abrir día", exact: true })).toBeVisible({
    timeout: 15_000,
  });
}
