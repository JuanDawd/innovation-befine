/**
 * What each employee does during a simulated day. Every action is one user
 * task done through the UI, the way staff do it — no API shortcuts.
 */
import type { Locator } from "@playwright/test";
import { Actor, Rejected, chooseOption, expectToast } from "./lib/actor";
import { personName, phone } from "./lib/rng";

/** Things actors learn during the day that other actors use. */
export type Shared = {
  pedidoUrls: string[];
  clients: string[];
};

const SIM_STYLIST = /^Sim /;
const SIM_CLOTHIER = /^Sim Confección/;

/** Waits up to `ms` for the element (isVisible() answers immediately, ignoring timeouts). */
async function appears(locator: Locator, ms: number): Promise<boolean> {
  return locator
    .first()
    .waitFor({ state: "visible", timeout: ms })
    .then(() => true)
    .catch(() => false);
}

/** The visible "Registrar servicio" button (sidebar + page each have one). */
async function lastButton(a: Actor, name: RegExp): Promise<Locator> {
  const buttons = a.page.getByRole("button", { name });
  await buttons.first().waitFor({ timeout: 15_000 });
  return buttons.nth((await buttons.count()) - 1);
}

/** Guest client in a client widget: "Invitado" → name → "Confirmar". */
async function pickGuest(a: Actor, scope: Locator, name: string): Promise<void> {
  await scope.getByRole("button", { name: /^Invitado$/ }).click();
  await scope.locator('input[placeholder*="Juan"]').fill(name);
  await scope.getByRole("button", { name: /^confirmar$/i }).click();
}

/** Saved client: search and take the first match; false when nothing matched. */
async function pickSaved(a: Actor, scope: Locator, name: string): Promise<boolean> {
  await scope
    .getByRole("textbox", { name: /^Buscar.*nombre/ })
    .first()
    .fill(name.split(" ")[0]!);
  const option = scope
    .getByRole("option", { name: new RegExp(name.split(" ")[0]!) })
    .or(scope.getByRole("button", { name: new RegExp(name.split(" ")[0]!) }))
    .first();
  if (!(await appears(option, 4_000))) return false;
  await option.click();
  return true;
}

// ── Service tickets ──────────────────────────────────────────────────────────

/** Secretary or cashier logs a service for a stylist ("Registrar servicio"). */
export async function logTicketForStylist(a: Actor, shared: Shared, home: string): Promise<void> {
  await a.goto(home);
  await (await lastButton(a, /^Registrar servicio$/)).click();
  const dialog = a.page.getByRole("dialog", { name: "Registrar servicio" });
  await chooseOption(dialog.getByRole("combobox", { name: "Empleado" }), (labels) => {
    const sim = labels.filter((l) => SIM_STYLIST.test(l));
    return sim.length ? a.rng.pick(sim) : undefined;
  });
  await fillServiceAndClient(a, shared, dialog);
}

/** Stylist logs their own service from the phone. */
export async function logOwnService(a: Actor, shared: Shared): Promise<void> {
  await a.goto("/stylist");
  await (await lastButton(a, /^Registrar servicio$/)).click();
  const dialog = a.page.getByRole("dialog", { name: "Registrar servicio" });
  await fillServiceAndClient(a, shared, dialog);
}

async function fillServiceAndClient(a: Actor, shared: Shared, dialog: Locator): Promise<void> {
  await chooseOption(dialog.getByRole("combobox", { name: "Servicio" }), (l) => a.rng.pick(l));
  // Services with several variants show one more select.
  const variant = dialog.getByRole("combobox", { name: /Variante|Opción/ });
  if (await appears(variant, 1_500)) {
    await chooseOption(variant, (l) => a.rng.pick(l));
  }
  if (a.rng.chance(0.15)) await dialog.getByRole("spinbutton", { name: "Cantidad" }).fill("2");

  const saved = shared.clients.length > 0 && a.rng.chance(0.3);
  if (!saved || !(await pickSaved(a, dialog, a.rng.pick(shared.clients)))) {
    await pickGuest(a, dialog, personName(a.rng));
  }
  await a.maybeInterrupt();
  const submit = dialog.getByRole("button", { name: "Registrar ticket" });
  if (!(await submit.isVisible().catch(() => false)))
    throw new Rejected("dialog lost after interruption");
  await a.submit(submit);
  await expectToast(a.page, /Ticket registrado correctamente/);
}

// ── Cashier board ─────────────────────────────────────────────────────────────

export async function markReady(a: Actor): Promise<void> {
  await a.goto("/cashier");
  const buttons = a.page.getByRole("button", { name: /^Marcar listo para cobrar: / });
  const n = await buttons.count();
  if (n === 0) throw new Rejected("nothing to mark ready");
  const button = buttons.nth(a.rng.int(0, n - 1));
  // "Marcar listo para cobrar: <client>, <services>" → "Cobrar a <client>: …"
  const client = ((await button.getAttribute("aria-label")) ?? "")
    .replace("Marcar listo para cobrar: ", "")
    .split(", ")[0]!;
  await a.submit(button);
  // No toast here: the card itself turns into "Cobrar a …".
  await a.page
    .getByRole("link", {
      name: new RegExp(`^Cobrar a ${client.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
    })
    .first()
    .waitFor({ timeout: 15_000 });
}

export async function charge(a: Actor): Promise<void> {
  await a.goto("/cashier");
  const links = a.page.getByRole("link", { name: /^Cobrar a / });
  const n = await links.count();
  if (n === 0) throw new Rejected("nothing awaiting payment");
  await links.nth(a.rng.int(0, n - 1)).click();
  // Normally a modal over the board; sometimes the full /cashier/checkout page.
  const dialog = a.page
    .getByRole("dialog")
    .filter({ hasText: "Total a cobrar" })
    .or(a.page.locator("main").filter({ hasText: "Total a cobrar" }))
    .first();
  await dialog.waitFor({ timeout: 20_000 });

  // Sometimes the price gets adjusted at the counter first (M-70).
  if (a.rng.chance(0.15)) {
    const adjust = dialog.getByRole("button", { name: "Ajustar" }).first();
    if (await adjust.isVisible().catch(() => false)) {
      await adjust.click();
      await dialog
        .getByLabel("Nuevo precio")
        .first()
        .fill(String(a.rng.int(5, 60) * 1_000));
      await dialog.getByLabel("Motivo del ajuste").first().fill("Descuento cliente frecuente");
      await dialog.getByRole("button", { name: "Guardar" }).first().click();
      await expectToast(a.page, /Precio ajustado/);
    }
  }

  const mode = a.rng.weighted([
    ["cash", 5],
    ["card", 3],
    ["split", 2],
  ] as const);
  const methodSelects = dialog.locator("select");
  if (mode === "card") await methodSelects.first().selectOption("card");
  if (mode === "split") {
    // Part in cash, the rest by transfer.
    const total = Number(
      (
        (await dialog.getByText("Total a cobrar").locator("..").innerText()).match(
          /\$([\d.]+)/,
        )?.[1] ?? "0"
      ).replace(/\./g, ""),
    );
    const cash = Math.max(1_000, Math.round((total * a.rng.int(20, 70)) / 100 / 1_000) * 1_000);
    const amounts = dialog.getByRole("textbox", { name: /^Monto en / });
    await amounts.first().fill(String(Math.min(cash, total - 1_000 > 0 ? total - 1_000 : total)));
    await dialog.getByRole("button", { name: /Agregar método/ }).click();
    await methodSelects.nth(1).selectOption("transfer");
  }
  await dialog.getByRole("button", { name: "Restante" }).last().click();

  const confirmCharge = dialog.getByRole("button", { name: "Confirmar cobro" });
  await a.submit(confirmCharge);
  const confirm = a.page.getByRole("dialog", { name: /^¿?Cobrar \$/ });
  // A double tap can open and dismiss the confirmation; people just tap again.
  if (!(await appears(confirm, 3_000))) await confirmCharge.click();
  await confirm.getByRole("button", { name: "Confirmar" }).click({ timeout: 10_000 });
  await expectToast(a.page, /Pago registrado correctamente/, 20_000);
}

export async function voidOne(a: Actor): Promise<void> {
  await a.goto("/cashier");
  const buttons = a.page.getByRole("button", { name: /^Anular ticket de / });
  const n = await buttons.count();
  if (n === 0) throw new Rejected("nothing to void");
  await buttons.nth(a.rng.int(0, n - 1)).click();
  const dialog = a.page.getByRole("dialog", { name: /^¿Anular el ticket de / });
  await dialog.getByLabel("Motivo").fill("El cliente se fue sin esperar");
  await a.submit(dialog.getByRole("button", { name: "Anular ticket" }));
  await expectToast(a.page, /anulado/);
}

export async function sellGarment(a: Actor): Promise<void> {
  await a.goto("/cashier");
  await (await lastButton(a, /^Vender prenda$/)).click();
  const dialog = a.page.getByRole("dialog", { name: "Vender prenda" });
  await chooseOption(dialog.getByRole("combobox", { name: "Prenda *" }), (l) => a.rng.pick(l));
  await chooseOption(dialog.getByRole("combobox", { name: "Talla y color *" }), (l) => {
    const inStock = l.filter((x) => !/— 0 disponibles/.test(x));
    return inStock.length ? a.rng.pick(inStock) : undefined;
  });
  if (a.rng.chance(0.2)) await dialog.getByRole("spinbutton", { name: "Cantidad" }).fill("2");
  const who = a.rng.weighted([
    ["anon", 6],
    ["guest", 3],
    ["saved", 1],
  ] as const);
  if (who === "guest") {
    await dialog.getByRole("button", { name: "Invitado" }).click();
    await dialog.getByPlaceholder("Nombre del cliente").fill(personName(a.rng));
  }
  if (who === "saved") {
    await dialog.getByRole("button", { name: "Cliente registrado" }).click();
    await chooseOption(dialog.locator("select").last(), (l) => a.rng.pick(l));
  }
  await dialog
    .getByRole("group", { name: /Método de pago/ })
    .getByRole("button", { name: a.rng.pick(["Efectivo", "Tarjeta", "Transferencia"]) })
    .click();
  const oversell = dialog.getByRole("checkbox", { name: /Vender aunque/ });
  if (await oversell.isVisible().catch(() => false)) throw new Rejected("would oversell");
  await a.submit(dialog.getByRole("button", { name: "Registrar venta" }));
  await expectToast(a.page, /Venta (registrada|guardada)/);
}

export async function adjustInventory(a: Actor): Promise<void> {
  await a.goto("/inventario");
  await a.page.getByRole("button", { name: "Nuevo ajuste" }).click();
  const dialog = a.page.getByRole("dialog", { name: "Ajustar inventario" });
  await chooseOption(dialog.getByRole("combobox", { name: "Prenda" }), (l) => a.rng.pick(l));
  await chooseOption(dialog.getByRole("combobox", { name: "Talla" }), (l) =>
    a.rng.pick(l.slice(0, 6)),
  );
  await chooseOption(dialog.getByRole("combobox", { name: "Color" }), (l) => a.rng.pick(l));
  await dialog.getByRole("textbox", { name: "Unidades" }).fill(String(a.rng.int(1, 6)));
  await a.submit(dialog.getByRole("button", { name: "Guardar ajuste" }));
  await expectToast(a.page, /Inventario actualizado/);
}

// ── Clients and appointments ──────────────────────────────────────────────────

export async function createClient(a: Actor, shared: Shared, path: string): Promise<void> {
  await a.goto(path);
  await a.page.getByRole("button", { name: "Agregar cliente" }).click();
  const dialog = a.page.getByRole("dialog", { name: "Nuevo cliente" });
  const name = personName(a.rng);
  await dialog.getByRole("textbox", { name: "Nombre" }).fill(name);
  await dialog.getByRole("textbox", { name: /Teléfono/ }).fill(phone(a.rng));
  await a.submit(dialog.getByRole("button", { name: "Crear" }));
  await expectToast(a.page, /Cliente creado correctamente/);
  shared.clients.push(name);
}

export async function bookAppointment(a: Actor, path: string): Promise<void> {
  await a.goto(path);
  await a.page.getByRole("button", { name: /nueva cita/i }).click();
  const dialog = a.page.getByRole("dialog");
  await pickGuest(a, dialog, personName(a.rng));
  await chooseOption(a.page.locator("#apt-stylist"), (l) => {
    const sim = l.filter((x) => SIM_STYLIST.test(x));
    return sim.length ? a.rng.pick(sim) : undefined;
  });
  await a.page
    .locator("#apt-service")
    .fill(a.rng.pick(["Corte", "Manicure", "Maquillaje social", "Cepillado"]));
  // Bogotá local time, today after now or the next days, on the half hour.
  const when = new Date(Date.now() + a.rng.int(1, 72) * 3_600_000);
  const hour = a.rng.int(8, 18);
  const pad = (n: number) => String(n).padStart(2, "0");
  const local = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}T${pad(hour)}:${a.rng.pick(["00", "30"])}`;
  await a.page.locator("#apt-datetime").fill(local);
  await a.page.locator("#apt-duration").fill(String(a.rng.pick([30, 45, 60, 90])));
  await a.submit(dialog.getByRole("button", { name: /reservar cita/i }));
  const outcome = await Promise.race([
    a.page
      .locator("[data-sonner-toast]")
      .filter({ hasText: /Cita para|Cita reservada/ })
      .first()
      .waitFor({ timeout: 15_000 })
      .then(() => "ok"),
    dialog
      .getByText(/ocupad|se cruza|conflict|en el pasado/i)
      .first()
      .waitFor({ timeout: 15_000 })
      .then(() => "conflict"),
  ]).catch(() => "timeout");
  if (outcome === "conflict") throw new Rejected("slot taken");
  if (outcome !== "ok") throw new Error("no booking confirmation");
}

// ── Pedidos and production ────────────────────────────────────────────────────

export async function createPedido(a: Actor, shared: Shared): Promise<void> {
  await a.goto("/pedidos/new");
  // Styled cards over hidden radios: click the visible label.
  const forStockCard = a.page.locator("main").getByText("Para inventario", { exact: true });
  const forStock = shared.clients.length === 0 || a.rng.chance(0.5);
  if (forStock) {
    await forStockCard.click();
  } else if (!(await pickSaved(a, a.page.locator("main"), a.rng.pick(shared.clients)))) {
    await forStockCard.click();
  }

  const garments = a.rng.chance(0.3) ? 2 : 1;
  for (let i = 1; i <= garments; i++) {
    if (i > 1) await a.page.getByRole("button", { name: "Agregar prenda" }).click();
    const group = a.page.getByRole("group", { name: `Prenda ${i}` });
    await chooseOption(group.getByRole("combobox", { name: "Prenda" }), (l) => a.rng.pick(l));
    const sizes = group.getByRole("group", { name: "Cantidades por talla" }).getByRole("textbox");
    const sizeCount = await sizes.count();
    const big = a.rng.chance(0.25); // busy day: some large orders
    for (let s = 0; s < a.rng.int(1, 3); s++) {
      await sizes
        .nth(a.rng.int(0, Math.min(5, sizeCount - 1)))
        .fill(String(big ? a.rng.int(5, 15) : a.rng.int(1, 4)));
    }
  }
  if (a.rng.chance(0.6)) {
    const d = new Date(Date.now() + a.rng.int(3, 20) * 86_400_000);
    await a.page
      .getByRole("textbox", { name: /Entrega estimada/ })
      .fill(d.toISOString().slice(0, 10));
  }
  await a.submit(a.page.getByRole("button", { name: "Crear pedido" }));
  // Success lands on the new pedido's page.
  await a.page.waitForURL(/\/pedidos\/[0-9a-f-]{36}/, { timeout: 20_000 });
  shared.pedidoUrls.push(new URL(a.page.url()).pathname);
}

async function openSomePedido(a: Actor, shared: Shared, withBalance = false): Promise<void> {
  if (!withBalance && shared.pedidoUrls.length && a.rng.chance(0.7)) {
    await a.goto(a.rng.pick(shared.pedidoUrls));
    return;
  }
  await a.goto("/pedidos");
  const links = a.page
    .getByRole("link", { name: withBalance ? /^#\d+.*Saldo/ : /^#\d+/ })
    .filter({ hasNotText: /Cancelado|Pagado/ });
  const n = await links.count();
  if (n === 0) throw new Rejected("no open pedidos");
  await links.nth(a.rng.int(0, Math.min(n, 8) - 1)).click();
  await a.page.waitForURL(/\/pedidos\/[0-9a-f-]{36}/, { timeout: 15_000 });
}

export async function assignUnits(a: Actor, shared: Shared): Promise<void> {
  await openSomePedido(a, shared);
  const assign = a.page.getByRole("button", { name: "Asignar" });
  if ((await assign.count()) === 0) throw new Rejected("nothing to assign");
  await assign.nth(a.rng.int(0, (await assign.count()) - 1)).click();
  const dialog = a.page.getByRole("dialog", { name: "Asignar unidades" });
  await chooseOption(
    dialog.getByRole("combobox", { name: "Talla" }),
    (l) => {
      const open = l.filter((x) => !/· 0 sin asignar/.test(x));
      return open.length ? a.rng.pick(open) : undefined;
    },
    { placeholder: false },
  );
  await chooseOption(dialog.getByRole("combobox", { name: "Confeccionista" }), (l) => {
    const sim = l.filter((x) => SIM_CLOTHIER.test(x));
    return sim.length ? a.rng.pick(sim) : undefined;
  });
  await a.submit(dialog.getByRole("button", { name: /^Asignar \d+ unidad/ }));
  await expectToast(a.page, /asignadas? a/);
}

export async function reviewUnits(a: Actor): Promise<void> {
  await a.goto("/produccion");
  const quick = a.page.getByRole("button", { name: /^Aprobar las \d+ unidad/ });
  const n = await quick.count();
  if (n === 0) throw new Rejected("nothing to review");
  if (a.rng.chance(0.8)) {
    await a.submit(quick.nth(a.rng.int(0, n - 1)));
  } else {
    await a.page
      .getByRole("button", { name: "Revisar" })
      .nth(a.rng.int(0, n - 1))
      .click();
    const dialog = a.page.getByRole("dialog", { name: "Revisar unidades" });
    await a.submit(dialog.getByRole("button", { name: "Guardar revisión" }));
  }
  await expectToast(a.page, /revisadas?/);
}

export async function approveClosing(a: Actor): Promise<void> {
  await a.goto("/produccion?tab=cierres");
  const approve = a.page
    .getByRole("region", { name: /^Por aprobar/ })
    .getByRole("button", { name: "Aprobar" });
  if ((await approve.count()) === 0) throw new Rejected("no closings to approve");
  await a.submit(approve.first());
  await expectToast(a.page, /Cierre de .* (aprobado|corregido)/);
}

export async function deliver(a: Actor, shared: Shared): Promise<void> {
  await openSomePedido(a, shared);
  const button = a.page.getByRole("button", { name: "Registrar entrega" });
  if (!(await appears(button, 3_000))) throw new Rejected("nothing to deliver");
  await button.click();
  const dialog = a.page.getByRole("dialog", { name: "Registrar entrega" });
  await a.submit(dialog.getByRole("button", { name: /^Registrar \d+ unidad/ }));
  await expectToast(a.page, /Entrega de \d+ unidad/);
}

export async function pedidoPayment(a: Actor, shared: Shared): Promise<void> {
  // Stock pedidos have no payments; pick a client pedido that still owes.
  await openSomePedido(a, shared, true);
  const button = a.page.getByRole("button", { name: "Registrar pago" });
  if (!(await appears(button, 3_000))) throw new Rejected("no payment button");
  await button.click();
  const dialog = a.page.getByRole("dialog", { name: "Registrar pago" });
  if (a.rng.chance(0.4)) {
    // A deposit instead of the full balance.
    await dialog.getByRole("textbox", { name: "Valor" }).fill(String(a.rng.int(1, 10) * 10_000));
  }
  await dialog.getByRole("combobox", { name: "Medio de pago" }).selectOption({
    label: a.rng.pick(["Efectivo", "Tarjeta", "Transferencia"]),
  });
  await a.submit(dialog.getByRole("button", { name: /^Cobrar \$/ }));
  await expectToast(a.page, /Pago de .* (registrado|guardado)/);
}

// ── Clothier on the phone ─────────────────────────────────────────────────────

export async function claimWork(a: Actor): Promise<void> {
  await a.goto("/clothier");
  // Disabled when she reached her claim limit.
  const take = a.page.getByRole("button", { name: "Tomar" }).and(a.page.locator(":enabled"));
  const n = await take.count();
  if (n === 0) throw new Rejected("nothing available or claim limit reached");
  await take.nth(a.rng.int(0, n - 1)).click();
  const dialog = a.page.getByRole("dialog", { name: "¿Cuántas tomas?" });
  const more = dialog.getByRole("button", { name: "Una más" });
  for (let i = a.rng.int(0, 4); i > 0 && (await more.isEnabled().catch(() => false)); i--)
    await more.click();
  await a.submit(dialog.getByRole("button", { name: /^Tomar \d+ unidad/ }));
  await expectToast(a.page, /Tomaste \d+ unidad/);
}

export async function reportDone(a: Actor): Promise<void> {
  await a.goto("/clothier");
  const report = a.page.getByRole("button", { name: "Reportar terminadas" });
  const n = await report.count();
  if (n === 0) throw new Rejected("nothing to report");
  await report.nth(a.rng.int(0, n - 1)).click();
  const dialog = a.page.getByRole("dialog", { name: "¿Cuántas terminaste?" });
  await a.maybeInterrupt();
  const submit = dialog.getByRole("button", { name: /^Reportar \d+ unidad/ });
  if (!(await submit.isVisible().catch(() => false)))
    throw new Rejected("dialog lost after interruption");
  await a.submit(submit);
  await expectToast(a.page, /unidad(es)? reportadas?/);
}

export async function releaseWork(a: Actor): Promise<void> {
  await a.goto("/clothier");
  const release = a.page.getByRole("button", { name: "Devolver" });
  if ((await release.count()) === 0) throw new Rejected("nothing to release");
  await release.first().click();
  const dialog = a.page.getByRole("dialog", { name: "¿Cuántas devuelves?" });
  await a.submit(dialog.getByRole("button", { name: /^Devolver \d+ unidad/ }));
  await expectToast(a.page, /devueltas?/);
}

export async function closeClothierDay(a: Actor): Promise<void> {
  await a.goto("/clothier/cierre");
  if (
    await a.page
      .getByText(/Ya enviaste tu cierre|Tu cierre fue aprobado/)
      .isVisible()
      .catch(() => false)
  ) {
    throw new Rejected("closing already sent today");
  }
  const send = a.page.getByRole("button", { name: /^Cerrar (con|sin)/ });
  await send.waitFor({ timeout: 15_000 });
  if (/sin unidades/.test(await send.innerText())) {
    await a.page.getByRole("checkbox", { name: /no terminé unidades/ }).check();
  }
  await a.submit(send);
  await expectToast(a.page, /Jornada cerrada/);
}

// ── Opening and closing the day ───────────────────────────────────────────────

export async function openDay(a: Actor): Promise<void> {
  await a.goto("/cashier");
  const open = a.page.getByRole("button", { name: "Abrir día", exact: true });
  const close = a.page.getByRole("button", { name: "Cerrar día", exact: true });
  await open.or(close).first().waitFor({ timeout: 20_000 });
  if (await close.isVisible()) return;
  await open.click();
  await close.waitFor({ timeout: 20_000 });
}

export async function closeDay(a: Actor): Promise<void> {
  await a.goto("/cashier");
  await a.page.getByRole("button", { name: "Cerrar día", exact: true }).click();
  const dialog = a.page.getByRole("dialog", { name: "¿Cerrar el día?" });
  await dialog.getByRole("button", { name: "Cerrar día", exact: true }).click({ timeout: 15_000 });
  // Unpaid tickets block the close and open Cobrar instead (H-49).
  const outcome = await Promise.race([
    a.page
      .getByRole("button", { name: "Abrir día", exact: true })
      .waitFor({ timeout: 20_000 })
      .then(() => "closed"),
    a.page.waitForURL(/\/cashier\/checkout/, { timeout: 20_000 }).then(() => "blocked"),
  ]).catch(() => "timeout");
  if (outcome === "blocked") throw new Rejected("unpaid tickets block the close");
  if (outcome !== "closed") throw new Error("day did not close");
}

export async function settlePayroll(a: Actor, employeeName: string): Promise<void> {
  await a.goto("/admin/payroll");
  await chooseOption(a.page.getByRole("combobox", { name: "Seleccionar empleado…" }), (l) =>
    l.find((x) => x.startsWith(`${employeeName} (`)),
  );
  await a.page.waitForURL(/employeeId=/, { timeout: 15_000 });
  const payAll = a.page.getByRole("button", { name: "Pagar hasta hoy" });
  if (!(await payAll.isEnabled({ timeout: 10_000 }).catch(() => false)))
    throw new Rejected("nothing to pay");
  await payAll.click();
  const review = a.page
    .getByRole("heading", { name: "3. Revisa y confirma el pago" })
    .locator("..");
  await review.waitFor({ timeout: 20_000 });
  await review.getByRole("button", { name: "Confirmar pago" }).click();
  const confirm = a.page
    .getByRole("alertdialog", { name: /^¿Pagar / })
    .or(a.page.getByRole("dialog", { name: /^¿Pagar / }));
  await confirm.getByRole("button", { name: "Confirmar pago" }).click();
  await expectToast(a.page, /Pago registrado correctamente/, 20_000);
}

/** Read-only wandering: the pages people open between tasks. */
export async function browse(a: Actor, paths: readonly string[]): Promise<void> {
  await a.goto(a.rng.pick(paths));
  await a.think(1_000, 3_000);
}
