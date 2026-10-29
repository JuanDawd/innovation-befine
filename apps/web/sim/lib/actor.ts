import type { Browser, BrowserContext, Locator, Page } from "@playwright/test";
import { join } from "node:path";
import type { Report } from "./report";
import type { Rng } from "./rng";

export type SimConfig = {
  baseUrl: string;
  password: string;
  runId: string;
  /** Vercel "Protection Bypass for Automation" secret, for protected previews. */
  bypass?: string;
  /** 0–1: how often an action includes a user mistake (double click, reload…). */
  chaos: number;
};

/** The app said no on purpose (validation, conflict). Counted, not a bug. */
export class Rejected extends Error {}

const IGNORED_FAILURES = [
  "net::ERR_ABORTED", // navigation away / SSE closed — normal
  "NS_BINDING_ABORTED",
];

/**
 * One employee at one device. Wraps every action in `step()`, which times it,
 * classifies the outcome and records whatever the browser complained about.
 */
export class Actor {
  page!: Page;
  context!: BrowserContext;
  private currentAction: string | undefined;

  constructor(
    readonly name: string,
    readonly email: string,
    readonly rng: Rng,
    private readonly cfg: SimConfig,
    private readonly report: Report,
    readonly mobile: boolean,
  ) {}

  async start(browser: Browser): Promise<void> {
    this.context = await browser.newContext({
      baseURL: this.cfg.baseUrl,
      viewport: this.mobile ? { width: 390, height: 844 } : { width: 1366, height: 900 },
      hasTouch: this.mobile,
      isMobile: this.mobile,
      locale: "es-CO",
      timezoneId: "America/Bogota",
    });
    // Tag this browser's Sentry events (instrumentation-client.ts reads it).
    await this.context.addInitScript((runId) => {
      try {
        window.localStorage.setItem("befine:sim-run", runId);
      } catch {
        // Storage blocked — events just go untagged.
      }
    }, this.cfg.runId);
    this.page = await this.context.newPage();
    this.watch(this.page);

    if (this.cfg.bypass) {
      // Sets Vercel's bypass cookie; later navigations carry it.
      await this.page.goto(
        `/?x-vercel-protection-bypass=${encodeURIComponent(this.cfg.bypass)}&x-vercel-set-bypass-cookie=samesitenone`,
      );
    }
    await this.login();
  }

  private watch(page: Page): void {
    page.on("pageerror", (err) =>
      this.emit("page_error", `${err.name}: ${err.message}`, page.url()),
    );
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      // The browser already reports failed responses; avoid double counting.
      if (/Failed to load resource/.test(text)) return;
      // Vercel's preview feedback toolbar is blocked by the app's CSP — preview-only noise.
      if (/vercel\.live/.test(text)) return;
      this.emit("console_error", text, page.url());
    });
    page.on("response", (res) => {
      if (res.status() < 500) return;
      this.emit(
        "http_5xx",
        `${res.status()} ${res.request().method()} ${new URL(res.url()).pathname}`,
        page.url(),
        res.headers()["x-vercel-id"],
      );
    });
    page.on("requestfailed", (req) => {
      const failure = req.failure()?.errorText ?? "unknown";
      if (IGNORED_FAILURES.some((f) => failure.includes(f))) return;
      const url = new URL(req.url());
      const host = url.hostname;
      if (host === "sentry.io" || host.endsWith(".sentry.io") || host === "vercel.live") return;
      this.emit("request_failed", `${failure} ${req.method()} ${url.pathname}`, page.url());
    });
  }

  private emit(
    kind:
      | "page_error"
      | "console_error"
      | "http_5xx"
      | "request_failed"
      | "error_toast"
      | "error_boundary",
    detail: string,
    url?: string,
    requestId?: string,
  ) {
    this.report.add({ actor: this.name, kind, action: this.currentAction, detail, url, requestId });
  }

  async login(): Promise<void> {
    const page = this.page;
    await page.goto("/login");
    // Click only once React owns the form (H-61).
    await page.waitForFunction(() => {
      const b = document.querySelector('button[type="submit"]');
      return !!b && Object.keys(b).some((k) => k.startsWith("__reactProps"));
    });
    await page.locator("#email").fill(this.email);
    await page.locator("#password").fill(this.cfg.password);
    await page.getByRole("button", { name: /iniciar sesión/i }).click();
    await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 45_000 });
  }

  /**
   * Run one user action. Outcome: ok, rejected (the app refused on purpose)
   * or failed (with a screenshot). Never throws — the day goes on.
   */
  async step(action: string, fn: () => Promise<void>): Promise<"ok" | "rejected" | "failed"> {
    this.currentAction = action;
    const started = Date.now();
    try {
      await fn();
      await this.checkScreen();
      this.report.add({
        actor: this.name,
        kind: "step_ok",
        action,
        detail: "",
        ms: Date.now() - started,
      });
      return "ok";
    } catch (err) {
      const ms = Date.now() - started;
      const message = err instanceof Error ? err.message.split("\n")[0]! : String(err);
      if (err instanceof Rejected) {
        this.report.add({ actor: this.name, kind: "step_rejected", action, detail: message, ms });
        return "rejected";
      }
      await this.checkScreen().catch(() => {});
      const shot = join(this.report.dir, "shots", `${Date.now()}-${this.name}-${action}.png`);
      await this.page.screenshot({ path: shot }).catch(() => {});
      this.report.add({
        actor: this.name,
        kind: "step_failed",
        action,
        detail: message,
        url: this.page.url(),
        ms,
        screenshot: shot,
      });
      await this.recover();
      return "failed";
    } finally {
      this.currentAction = undefined;
    }
  }

  /** Error toasts and the error boundary are what a real user would see. */
  private async checkScreen(): Promise<void> {
    const toasts = this.page.locator('[data-sonner-toast][data-type="error"]');
    const n = await toasts.count();
    for (let i = 0; i < n; i++) {
      const text = (
        await toasts
          .nth(i)
          .innerText()
          .catch(() => "")
      )
        .replace(/\s+/g, " ")
        .trim();
      if (text) this.emit("error_toast", text, this.page.url());
    }
    if (
      await this.page
        .getByText("Algo salió mal")
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      this.emit("error_boundary", "Algo salió mal", this.page.url());
    }
  }

  /** After a failure: close dialogs, and if the session dropped, log in again. */
  private async recover(): Promise<void> {
    await this.page.keyboard.press("Escape").catch(() => {});
    if (this.page.url().includes("/login")) await this.login().catch(() => {});
  }

  // ── Mistakes real users make ───────────────────────────────────────────────

  /** Click a submit-type button, sometimes twice in a row (impatient tap). */
  async submit(button: Locator): Promise<void> {
    if (this.rng.chance(this.cfg.chaos * 0.5)) {
      await button.dblclick({ timeout: 10_000 });
    } else {
      await button.click({ timeout: 10_000 });
    }
  }

  /** Sometimes the user wanders off mid-task: reload, back, or a network blip. */
  async maybeInterrupt(): Promise<"none" | "reload" | "back" | "offline"> {
    if (!this.rng.chance(this.cfg.chaos * 0.3)) return "none";
    const kind = this.rng.pick(["reload", "back", "offline"] as const);
    if (kind === "reload") await this.page.reload().catch(() => {});
    if (kind === "back") await this.page.goBack().catch(() => {});
    if (kind === "offline") {
      await this.context.setOffline(true);
      await this.page.waitForTimeout(this.rng.int(1_500, 5_000));
      await this.context.setOffline(false);
    }
    return kind;
  }

  async think(minMs = 800, maxMs = 4_000): Promise<void> {
    await this.page.waitForTimeout(this.rng.int(minMs, maxMs));
  }

  /** Navigate and wait until the page's data has loaded (no skeletons left). */
  async goto(path: string): Promise<void> {
    await this.page.goto(path, { waitUntil: "domcontentloaded" });
    await this.settle();
  }

  async settle(): Promise<void> {
    await this.page.locator("main").first().waitFor({ timeout: 20_000 });
    await this.page
      .waitForFunction(() => !document.querySelector('main [data-slot="skeleton"]'), undefined, {
        timeout: 20_000,
      })
      .catch(() => {});
    await this.page.waitForTimeout(400);
  }

  async stop(): Promise<void> {
    await this.context.close().catch(() => {});
  }
}

/** Wait until a <select> has real options (it fills after a fetch), then pick one. */
export async function chooseOption(
  select: Locator,
  pick: (labels: string[]) => string | number | undefined,
  { placeholder = true }: { placeholder?: boolean } = {},
): Promise<string> {
  await select.waitFor({ timeout: 15_000 });
  const skip = placeholder ? 1 : 0;
  const deadline = Date.now() + 15_000;
  let labels: string[] = [];
  while (Date.now() < deadline) {
    labels = (await select.locator("option").allInnerTexts()).map((s) => s.trim());
    if (labels.length > skip) break;
    await select.page().waitForTimeout(300);
  }
  if (labels.length <= skip) throw new Error(`select has no options: ${labels.join(", ")}`);
  const choice = pick(labels.slice(skip));
  if (choice === undefined) throw new Rejected("nothing suitable to choose");
  const label = typeof choice === "number" ? labels[choice + skip]! : choice;
  await select.selectOption({ label });
  return label;
}

/** Waits for a success or error toast; error toast → Rejected with its text. */
export async function expectToast(page: Page, success: RegExp, timeout = 15_000): Promise<void> {
  // Success shows as a toast, or as a confirmation panel inside the dialog.
  const ok = page
    .locator("[data-sonner-toast]")
    .filter({ hasText: success })
    .or(page.getByRole("dialog").getByText(success));
  const bad = page.locator('[data-sonner-toast][data-type="error"]');
  // Forms also show server errors inline, as an alert inside the dialog.
  const inline = page.getByRole("dialog").locator("[role=alert]").filter({ hasText: /\S/ });
  const winner = await Promise.race([
    ok
      .first()
      .waitFor({ timeout })
      .then(() => "ok" as const),
    bad
      .first()
      .waitFor({ timeout })
      .then(() => "bad" as const),
    inline
      .first()
      .waitFor({ timeout })
      .then(() => "inline" as const),
  ]).catch(() => "timeout" as const);
  if (winner === "ok") return;
  if (winner === "inline") {
    const text = (
      await inline
        .first()
        .innerText()
        .catch(() => "")
    ).replace(/\s+/g, " ");
    if (/permisos|inesperado|interno/i.test(text)) throw new Error(`form error: ${text}`);
    throw new Rejected(`form error: ${text}`);
  }
  if (winner === "bad") {
    const text = (
      await bad
        .first()
        .innerText()
        .catch(() => "error toast")
    ).replace(/\s+/g, " ");
    // A generic message means the server failed, not that the user did something wrong.
    if (/inesperado|interno|intenta de nuevo/i.test(text)) throw new Error(`error toast: ${text}`);
    throw new Rejected(text);
  }
  throw new Error(`no confirmation toast matching ${success}`);
}
