import type { Page } from "@playwright/test";

export const CREDS = {
  admin: {
    email: process.env.E2E_ADMIN_EMAIL ?? "admin@befine.dev",
    password: process.env.E2E_ADMIN_PASSWORD ?? "Admin123!",
  },
  secretary: {
    email: process.env.E2E_SECRETARY_EMAIL ?? "secretary@befine.dev",
    password: process.env.E2E_SECRETARY_PASSWORD ?? "Secretary123!",
  },
  stylist: {
    email: process.env.E2E_STYLIST_EMAIL ?? "hairdresser@befine.dev",
    password: process.env.E2E_STYLIST_PASSWORD ?? "Stylist123!",
  },
  clothier: {
    email: process.env.E2E_CLOTHIER_EMAIL ?? "clothier@befine.dev",
    password: process.env.E2E_CLOTHIER_PASSWORD ?? "Clothier123!",
  },
} as const;

export type Role = keyof typeof CREDS;

export const AUTH_STATE_DIR = "e2e/.auth";

export async function loginAs(page: Page, role: Role): Promise<void> {
  const { email, password } = CREDS[role];
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /iniciar sesión/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15_000 });
}

export const ROLE_HOME: Record<Role, string> = {
  admin: "/admin/analytics",
  secretary: "/secretary",
  stylist: "/stylist",
  clothier: "/clothier",
};
