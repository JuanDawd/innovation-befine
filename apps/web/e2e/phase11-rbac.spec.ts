import { test, expect, type Page } from "@playwright/test";

/**
 * T134 — every Phase 11 route for every role (spec §3.8, §3.10), and the old
 * order/product routes landing on their replacements. Read-only: pages are
 * only visited. The cashier has no seeded login; its access is covered by the
 * unit matrix in middleware-helpers.test.ts.
 */

type Role = "admin" | "secretary" | "stylist" | "clothier";

const ROUTES: Record<string, Role[]> = {
  "/pedidos": ["admin", "secretary"],
  "/pedidos/new": ["admin", "secretary"],
  "/produccion": ["admin", "secretary"],
  "/inventario": ["admin"],
  "/actividad": ["admin"],
  "/admin/analytics": ["admin"],
  "/clothier": ["clothier"],
  "/clothier/cierre": ["clothier"],
};

const MENU: Record<Role, { shows: string[]; hides: string[] }> = {
  admin: {
    shows: ["Pedidos", "Producción", "Inventario", "Actividad"],
    hides: ["Pedidos grandes", "Productos"],
  },
  secretary: {
    shows: ["Pedidos", "Producción"],
    hides: ["Inventario", "Actividad", "Pedidos grandes", "Productos"],
  },
  stylist: { shows: [], hides: ["Pedidos", "Producción", "Inventario", "Actividad"] },
  // One destination (earnings hidden) means no tab bar at all: only the absences are checked.
  clothier: { shows: [], hides: ["Pedidos", "Producción", "Inventario", "Actividad"] },
};

async function denied(page: Page) {
  return page
    .getByRole("heading", { name: /acceso denegado/i })
    .isVisible({ timeout: 15_000 })
    .catch(() => false);
}

for (const role of ["admin", "secretary", "stylist", "clothier"] as const) {
  test.describe(`${role} — Phase 11 routes`, () => {
    test.use({ storageState: `e2e/.auth/${role}.json` });

    for (const [path, allowed] of Object.entries(ROUTES)) {
      const ok = allowed.includes(role);
      test(`${ok ? "reaches" : "is denied"} ${path}`, async ({ page }) => {
        await page.goto(path, { waitUntil: "domcontentloaded" });
        await expect(page).not.toHaveURL(/\/login/);
        if (ok) {
          await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });
          expect(await denied(page)).toBe(false);
        } else {
          await expect(page.getByRole("heading", { name: /acceso denegado/i })).toBeVisible({
            timeout: 30_000,
          });
        }
      });
    }

    test("menu shows the new screens and none of the old ones", async ({ page }) => {
      const home = {
        admin: "/cashier",
        secretary: "/secretary",
        stylist: "/stylist",
        clothier: "/clothier",
      }[role];
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(home, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });
      const nav = MENU[role].shows.length
        ? page.getByRole("navigation").first()
        : page.locator("body");
      for (const label of MENU[role].shows)
        await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
      for (const label of MENU[role].hides)
        await expect(nav.getByRole("link", { name: label, exact: true })).toHaveCount(0);
    });
  });
}

test.describe("old routes redirect to their replacements", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });
  for (const [from, to] of [
    ["/large-orders", "/pedidos"],
    ["/large-orders/00000000-0000-4000-8000-000000000001", "/pedidos"],
    ["/admin/products", "/produccion"],
    ["/secretary/products", "/produccion"],
  ] as const)
    test(`${from} → ${to}`, async ({ page }) => {
      await page.goto(from, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(new RegExp(`${to}$`));
    });
});

test.describe("old clothier board redirects", () => {
  test.use({ storageState: "e2e/.auth/clothier.json" });
  test("/clothier/productos → /clothier", async ({ page }) => {
    await page.goto("/clothier/productos", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/clothier$/);
  });
});
