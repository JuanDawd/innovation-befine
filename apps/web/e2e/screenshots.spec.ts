/**
 * Screenshot capture script — documentation use only.
 *
 * Visits every screen for every role and saves PNG screenshots to
 * docs/training/screenshots/{role}/{slug}.png (relative to repo root).
 *
 * Usage:
 *   pnpm --filter @befine/web test:e2e --project=chromium e2e/screenshots.ts
 *
 * Or with a running dev server already up:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 pnpm --filter @befine/web test:e2e \
 *     --project=chromium e2e/screenshots.ts
 *
 * Credentials are read from env vars (same as seed defaults):
 *   SCREENSHOT_ADMIN_EMAIL     SCREENSHOT_ADMIN_PASSWORD
 *   SCREENSHOT_SECRETARY_EMAIL SCREENSHOT_SECRETARY_PASSWORD
 *   SCREENSHOT_STYLIST_EMAIL   SCREENSHOT_STYLIST_PASSWORD
 *   SCREENSHOT_CLOTHIER_EMAIL  SCREENSHOT_CLOTHIER_PASSWORD
 *
 * Falls back to seed defaults if vars are not set.
 */

import { test, type Page, type BrowserContext } from "@playwright/test";
import { mkdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

// ─── Paths ────────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Repo root is 3 levels up from apps/web/e2e/
const REPO_ROOT = path.resolve(__dirname, "../../../");
const OUT_DIR = path.join(REPO_ROOT, "docs/training/screenshots");

// ─── Credentials ─────────────────────────────────────────────────────────────

type RoleCreds = { email: string; password: string };

const CREDS: Record<string, RoleCreds> = {
  admin: {
    email: process.env.SCREENSHOT_ADMIN_EMAIL ?? "admin@befine.dev",
    password: process.env.SCREENSHOT_ADMIN_PASSWORD ?? "Admin123!",
  },
  secretary: {
    email: process.env.SCREENSHOT_SECRETARY_EMAIL ?? "secretary@befine.dev",
    password: process.env.SCREENSHOT_SECRETARY_PASSWORD ?? "Secretary123!",
  },
  stylist: {
    email: process.env.SCREENSHOT_STYLIST_EMAIL ?? "hairdresser@befine.dev",
    password: process.env.SCREENSHOT_STYLIST_PASSWORD ?? "Stylist123!",
  },
  clothier: {
    email: process.env.SCREENSHOT_CLOTHIER_EMAIL ?? "clothier@befine.dev",
    password: process.env.SCREENSHOT_CLOTHIER_PASSWORD ?? "Clothier123!",
  },
};

// ─── Screen manifest ──────────────────────────────────────────────────────────

type ScreenDef = {
  slug: string;
  url: string;
  /** Additional wait time (ms) after networkidle — for charts, animations */
  extraWait?: number;
  /** Viewport override — defaults to role default */
  viewport?: { width: number; height: number };
  /** Wait for a specific selector to be visible before shooting */
  waitForSelector?: string;
};

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 }; // iPhone 14

const SCREENS: Record<string, ScreenDef[]> = {
  admin: [
    {
      slug: "01-dashboard",
      url: "/cashier",
      waitForSelector: "[data-slot='sidebar-wrapper']",
      extraWait: 800,
    },
    {
      slug: "02-ticket-history",
      url: "/cashier/tickets/history",
      waitForSelector: "h1",
    },
    {
      slug: "03-appointments",
      url: "/cashier/appointments",
      waitForSelector: "h1",
    },
    {
      slug: "04-large-orders",
      url: "/large-orders",
      waitForSelector: "h1",
    },
    {
      slug: "05-products",
      url: "/admin/products",
      waitForSelector: "h1",
    },
    {
      slug: "06-employees",
      url: "/admin/employees",
      waitForSelector: "h1",
    },
    {
      slug: "07-catalog",
      url: "/admin/catalog",
      waitForSelector: "[role='tablist']",
    },
    {
      slug: "08-absences",
      url: "/admin/absences",
      waitForSelector: "h1",
      extraWait: 400,
    },
    {
      slug: "09-payroll",
      url: "/admin/payroll",
      waitForSelector: "h1",
    },
    {
      slug: "10-analytics",
      url: "/admin/analytics",
      waitForSelector: "[role='tablist']",
      extraWait: 1200, // recharts renders async
    },
    {
      slug: "11-settings",
      url: "/admin/settings",
      waitForSelector: "h1",
    },
    {
      slug: "12-profile",
      url: "/profile",
      waitForSelector: "h1",
    },
  ],
  secretary: [
    {
      slug: "01-dashboard",
      url: "/secretary",
      waitForSelector: "h1",
    },
    {
      slug: "02-appointments",
      url: "/secretary/appointments",
      waitForSelector: "h1",
    },
    {
      slug: "03-products",
      url: "/secretary/products",
      waitForSelector: "h1",
    },
    {
      slug: "04-large-orders",
      url: "/large-orders",
      waitForSelector: "h1",
    },
    {
      slug: "05-earnings",
      url: "/secretary/earnings",
      waitForSelector: "main",
    },
    {
      slug: "06-clients",
      url: "/secretary/clients",
      waitForSelector: "h1",
    },
  ],
  stylist: [
    {
      slug: "01-my-tickets",
      url: "/stylist",
      viewport: MOBILE,
      waitForSelector: "nav",
      extraWait: 400,
    },
    {
      slug: "02-earnings",
      url: "/stylist/earnings",
      viewport: MOBILE,
      waitForSelector: "main",
    },
  ],
  clothier: [
    {
      slug: "01-my-work",
      url: "/clothier",
      viewport: MOBILE,
      waitForSelector: "nav",
      extraWait: 400,
    },
    {
      slug: "02-earnings",
      url: "/clothier/earnings",
      viewport: MOBILE,
      waitForSelector: "main",
    },
  ],
};

const ROLE_VIEWPORT: Record<string, { width: number; height: number }> = {
  admin: DESKTOP,
  secretary: DESKTOP,
  stylist: MOBILE,
  clothier: MOBILE,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function login(page: Page, creds: RoleCreds): Promise<void> {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  // Fill credentials — try both email and username-style inputs
  const emailInput = page.getByLabel(/email|correo|usuario/i).first();
  await emailInput.fill(creds.email);
  await page
    .getByLabel(/contraseña|password/i)
    .first()
    .fill(creds.password);
  await page.getByRole("button", { name: /iniciar sesión|login|sign in/i }).click();
  // Wait for redirect away from /login
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15_000 });
}

async function captureScreen(page: Page, screen: ScreenDef, outPath: string): Promise<void> {
  await page.goto(screen.url, { waitUntil: "networkidle", timeout: 30_000 });

  if (screen.waitForSelector) {
    await page.waitForSelector(screen.waitForSelector, { timeout: 10_000 }).catch(() => {
      // Non-fatal: selector might not exist on every data state
    });
  }

  if (screen.extraWait) {
    await page.waitForTimeout(screen.extraWait);
  }

  // Dismiss any open modals / toasts that may have appeared
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);

  await page.screenshot({
    path: outPath,
    fullPage: true,
    animations: "disabled",
  });

  console.log(`  ✓  ${outPath.replace(REPO_ROOT + "/", "")}`);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

// We use a single describe so Playwright allocates one worker per role describe block.
// Each role describe creates a fresh browser context (isolated session).

for (const [role, screens] of Object.entries(SCREENS)) {
  const creds = CREDS[role];
  const defaultViewport = ROLE_VIEWPORT[role] ?? DESKTOP;

  test.describe(`Screenshots — ${role}`, () => {
    let context: BrowserContext;

    test.beforeAll(async ({ browser }) => {
      // Create a persistent context with the role's viewport
      context = await browser.newContext({ viewport: defaultViewport });
      const page = await context.newPage();

      console.log(`\n→ Logging in as ${role} (${creds.email})`);
      await login(page, creds);
      await page.close();

      // Ensure output directory exists
      await mkdir(path.join(OUT_DIR, role), { recursive: true });
    });

    test.afterAll(async () => {
      await context.close();
    });

    for (const screen of screens) {
      test(screen.slug, async () => {
        const viewport = screen.viewport ?? defaultViewport;
        const page = await context.newPage();
        await page.setViewportSize(viewport);

        const outPath = path.join(OUT_DIR, role, `${screen.slug}.png`);
        await captureScreen(page, screen, outPath);
        await page.close();
      });
    }
  });
}
