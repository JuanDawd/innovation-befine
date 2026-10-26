/**
 * Workday simulator — a full salon + workshop day driven through the real UI.
 *
 * Ten employees work at once (admin, cashier, secretary, four stylists on
 * phones, three clothiers on phones): open the day, log and charge services,
 * book appointments, sell garments, run pedidos through production, close the
 * day and settle payroll. A share of actions include ordinary mistakes —
 * double taps, reloads, the back button, a dropped connection.
 *
 * Every browser tags its Sentry events with sim_run=<run id>; the run writes
 * sim-runs/<run id>/{events.jsonl,summary.md,shots/}.
 *
 * Staff come from packages/db/src/seed-sim.ts. NEVER point this at production.
 *
 * Run (from apps/web):
 *   SIM_PASSWORD=… [SIM_BYPASS=…] tsx sim/workday.ts --base-url https://… \
 *     [--minutes 30] [--seed 42] [--chaos 0.15] [--scale busy|normal] [--headed]
 */
import { chromium } from "@playwright/test";
import { parseArgs } from "node:util";
import { Actor, type SimConfig } from "./lib/actor";
import { Report } from "./lib/report";
import { Rng } from "./lib/rng";
import * as R from "./roles";

const { values: args } = parseArgs({
  options: {
    "base-url": { type: "string" },
    minutes: { type: "string", default: "30" },
    seed: { type: "string" },
    chaos: { type: "string", default: "0.15" },
    scale: { type: "string", default: "busy" },
    headed: { type: "boolean", default: false },
    out: { type: "string", default: "sim-runs" },
  },
});

const baseUrl = args["base-url"];
const password = process.env.SIM_PASSWORD;
if (!baseUrl || !password) {
  console.error("Usage: SIM_PASSWORD=… tsx sim/workday.ts --base-url <url> (see header)");
  process.exit(1);
}
if (/innovation-befine\.vercel\.app/.test(baseUrl)) {
  console.error("Refusing: that is production.");
  process.exit(1);
}

const seed = Number(args.seed ?? Date.now() % 1_000_000);
const busy = args.scale === "busy";
const minutes = Number(args.minutes);
const runId = `${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}-s${seed}`;
const cfg: SimConfig = {
  baseUrl,
  password,
  runId,
  bypass: process.env.SIM_BYPASS,
  chaos: Number(args.chaos),
};
const report = new Report(args.out!, runId);
const rng = new Rng(seed);
const shared: R.Shared = { pedidoUrls: [], clients: [] };

const mk = (name: string, email: string, mobile: boolean) =>
  new Actor(name, `${email}@sim.befine.dev`, rng.fork(), cfg, report, mobile);
const admin = mk("admin", "admin", false);
const cashier = mk("cashier", "cashier", false);
const secretary = mk("secretary", "secretary", false);
const stylists = [1, 2, 3, 4].map((i) => mk(`stylist${i}`, `stylist${i}`, true));
const clothiers = [1, 2, 3].map((i) => mk(`clothier${i}`, `clothier${i}`, true));
const everyone = [admin, cashier, secretary, ...stylists, ...clothiers];

type Plan = readonly (readonly [string, number, (a: Actor) => Promise<void>])[];

const ADMIN_PAGES = [
  "/admin/analytics",
  "/actividad",
  "/cashier/tickets/history",
  "/admin/employees",
  "/inventario",
  "/pedidos",
  "/admin/payroll",
];

const plans: Record<string, Plan> = {
  secretary: [
    ["log_ticket", 4, (a) => R.logTicketForStylist(a, shared, "/secretary")],
    ["book_appointment", 3, (a) => R.bookAppointment(a, "/secretary/appointments")],
    ["create_client", 1, (a) => R.createClient(a, shared, "/secretary/clients")],
    ["create_pedido", 2, (a) => R.createPedido(a, shared)],
    ["assign_units", 3, (a) => R.assignUnits(a, shared)],
    ["review_units", 2, (a) => R.reviewUnits(a)],
    ["deliver", 1, (a) => R.deliver(a, shared)],
    [
      "browse",
      1,
      (a) => R.browse(a, ["/secretary", "/pedidos", "/produccion", "/secretary/appointments"]),
    ],
  ],
  cashier: [
    ["mark_ready", 4, R.markReady],
    ["charge", 5, R.charge],
    ["sell_garment", 2, R.sellGarment],
    ["void_ticket", 0.3, R.voidOne],
    ["create_client", 0.5, (a) => R.createClient(a, shared, "/cashier/clients")],
    ["pedido_payment", 1, (a) => R.pedidoPayment(a, shared)],
    ["deliver", 1, (a) => R.deliver(a, shared)],
    ["log_ticket", 1, (a) => R.logTicketForStylist(a, shared, "/cashier")],
    [
      "browse",
      1,
      (a) =>
        R.browse(a, [
          "/cashier",
          "/cashier/tickets/history",
          "/inventario",
          "/cashier/appointments",
        ]),
    ],
  ],
  admin: [
    ["charge", 2, R.charge],
    ["mark_ready", 1, R.markReady],
    ["review_units", 2, (a) => R.reviewUnits(a)],
    ["create_pedido", 1, (a) => R.createPedido(a, shared)],
    ["assign_units", 1, (a) => R.assignUnits(a, shared)],
    ["adjust_inventory", 1, R.adjustInventory],
    ["pedido_payment", 1, (a) => R.pedidoPayment(a, shared)],
    ["browse", 3, (a) => R.browse(a, ADMIN_PAGES)],
  ],
  stylist: [
    ["log_own_service", 6, (a) => R.logOwnService(a, shared)],
    ["browse", 1, (a) => R.browse(a, ["/stylist", "/stylist/earnings", "/profile"])],
  ],
  clothier: [
    ["claim_work", 3, R.claimWork],
    ["report_done", 4, R.reportDone],
    ["release_work", 0.3, R.releaseWork],
    ["browse", 0.5, (a) => R.browse(a, ["/clothier", "/clothier/cierre"])],
  ],
};

/** Think time between tasks; a busy day is roughly three times the pace. */
const PACE: Record<string, [number, number]> = {
  secretary: busy ? [2_000, 8_000] : [6_000, 25_000],
  cashier: busy ? [1_500, 6_000] : [5_000, 20_000],
  admin: busy ? [4_000, 15_000] : [15_000, 60_000],
  stylist: busy ? [10_000, 40_000] : [40_000, 150_000],
  clothier: busy ? [8_000, 30_000] : [30_000, 120_000],
};

async function work(a: Actor, plan: Plan, pace: [number, number], until: number): Promise<void> {
  while (Date.now() < until) {
    const [action, , fn] = a.rng.weighted(plan.map((p) => [p, p[1]] as const));
    await a.step(action, () => fn(a));
    await a.think(...pace);
  }
}

/** Repeat an action until nothing is left (rejected), 3 failures in a row, or `max` times. */
async function drain(a: Actor, action: string, fn: () => Promise<void>, max = 60): Promise<void> {
  let failures = 0;
  for (let i = 0; i < max; i++) {
    const outcome = await a.step(action, fn);
    if (outcome === "rejected") return;
    failures = outcome === "failed" ? failures + 1 : 0;
    if (failures >= 3) return;
  }
}

async function main() {
  const started = Date.now();
  console.log(`Run ${runId} → ${baseUrl} (${args.scale}, ${minutes} min, chaos ${cfg.chaos})`);
  const browser = await chromium.launch({ headless: !args.headed });

  // Arrive at work a few seconds apart.
  for (const a of everyone) {
    await a
      .start(browser)
      .catch((err) =>
        report.add({
          actor: a.name,
          kind: "step_failed",
          action: "login",
          detail: String(err).split("\n")[0]!,
        }),
      );
  }

  // Opening
  await admin.step("open_day", () => R.openDay(admin));
  for (let i = 0; i < 3; i++)
    await secretary.step("create_client", () =>
      R.createClient(secretary, shared, "/secretary/clients"),
    );

  // The day
  const until = Date.now() + minutes * 60_000;
  await Promise.all([
    work(secretary, plans.secretary!, PACE.secretary!, until),
    work(cashier, plans.cashier!, PACE.cashier!, until),
    work(admin, plans.admin!, PACE.admin!, until),
    ...stylists.map((s) => work(s, plans.stylist!, PACE.stylist!, until)),
    ...clothiers.map((c) => work(c, plans.clothier!, PACE.clothier!, until)),
  ]);

  // Closing: finish production, charge what is left, close, pay.
  await Promise.all(
    clothiers.map((c) => c.step("close_clothier_day", () => R.closeClothierDay(c))),
  );
  await drain(secretary, "review_units", () => R.reviewUnits(secretary), 40);
  await drain(admin, "approve_closing", () => R.approveClosing(admin), 6);
  await drain(cashier, "mark_ready", () => R.markReady(cashier));
  await drain(cashier, "charge", () => R.charge(cashier));
  await drain(cashier, "void_ticket", () => R.voidOne(cashier), 20);
  await cashier.step("close_day", () => R.closeDay(cashier));
  for (const name of ["Sim Peluquera Ana", "Sim Secretaria", "Sim Confección Eva"]) {
    await admin.step("settle_payroll", () => R.settlePayroll(admin, name));
  }

  await Promise.all(everyone.map((a) => a.stop()));
  await browser.close();

  const text = report.summary({
    "base url": baseUrl!,
    seed,
    scale: args.scale!,
    minutes,
    chaos: cfg.chaos,
    "wall time": `${Math.round((Date.now() - started) / 60_000)} min`,
    "sentry tag": `sim_run:${runId}`,
  });
  console.log("\n" + text);
  console.log(`Report: ${report.dir}/summary.md`);
}

await main();
