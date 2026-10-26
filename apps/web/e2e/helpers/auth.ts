import type { Page } from "@playwright/test";

/** E2E logins come from the environment (same values the seed used) — no defaults. */
function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not set — use the passwords you seeded with (SEED_*).`);
  return value;
}

export const CREDS = {
  admin: {
    email: process.env.E2E_ADMIN_EMAIL ?? "admin@befine.dev",
    get password() {
      return required("E2E_ADMIN_PASSWORD");
    },
  },
  secretary: {
    email: process.env.E2E_SECRETARY_EMAIL ?? "secretary@befine.dev",
    get password() {
      return required("E2E_SECRETARY_PASSWORD");
    },
  },
  stylist: {
    email: process.env.E2E_STYLIST_EMAIL ?? "hairdresser@befine.dev",
    get password() {
      return required("E2E_STYLIST_PASSWORD");
    },
  },
  clothier: {
    email: process.env.E2E_CLOTHIER_EMAIL ?? "clothier@befine.dev",
    get password() {
      return required("E2E_CLOTHIER_PASSWORD");
    },
  },
} as const;

export type Role = keyof typeof CREDS;

export const AUTH_STATE_DIR = "e2e/.auth";

export async function loginAs(page: Page, role: Role): Promise<void> {
  const { email, password } = CREDS[role];
  await page.goto("/login", { waitUntil: "networkidle" });
  // Click only once React owns the form: an earlier click submits it natively.
  await page.waitForFunction(() => {
    const button = document.querySelector('button[type="submit"]');
    return !!button && Object.keys(button).some((k) => k.startsWith("__reactProps"));
  });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /iniciar sesión/i }).click();
  // The first visit to a role's home compiles it on a dev server.
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 45_000 });
}

export const ROLE_HOME: Record<Role, string> = {
  admin: "/admin/analytics",
  secretary: "/secretary",
  stylist: "/stylist",
  clothier: "/clothier",
};
