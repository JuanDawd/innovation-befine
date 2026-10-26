/**
 * Workday simulator staff (apps/web/sim) — one shared password, never defaulted.
 *
 * Creates the sim's own employees (*@sim.befine.dev) so a run never touches
 * real or dev accounts. Safe to run again: existing emails are skipped.
 *
 * Two guards, both required:
 *   SIM_DATABASE_URL + SIM_CONFIRM_HOST=<database host>   you typed the host
 *   SIM_PASSWORD (min. 12 chars)                          the staff password
 *
 * Never point it at production.
 */

import { hashPassword } from "@better-auth/utils/password";
import { eq } from "drizzle-orm";
import { accounts, employees, users } from "./schema";
import { createDb } from "./index";

type SimRole = "admin" | "cashier" | "secretary" | "stylist" | "clothier";

export type SimStaff = {
  email: string;
  name: string;
  role: SimRole;
  stylistSubtype?: "hairdresser" | "manicurist" | "masseuse" | "makeup_artist" | "spa_manager";
  dailyRate?: number;
};

export const SIM_STAFF: SimStaff[] = [
  { email: "admin@sim.befine.dev", name: "Sim Admin", role: "admin" },
  { email: "cashier@sim.befine.dev", name: "Sim Caja", role: "cashier" },
  {
    email: "secretary@sim.befine.dev",
    name: "Sim Secretaria",
    role: "secretary",
    dailyRate: 60_000,
  },
  {
    email: "stylist1@sim.befine.dev",
    name: "Sim Peluquera Ana",
    role: "stylist",
    stylistSubtype: "hairdresser",
  },
  {
    email: "stylist2@sim.befine.dev",
    name: "Sim Peluquera Bea",
    role: "stylist",
    stylistSubtype: "hairdresser",
  },
  {
    email: "stylist3@sim.befine.dev",
    name: "Sim Manicurista Caro",
    role: "stylist",
    stylistSubtype: "manicurist",
  },
  {
    email: "stylist4@sim.befine.dev",
    name: "Sim Maquilladora Dani",
    role: "stylist",
    stylistSubtype: "makeup_artist",
  },
  { email: "clothier1@sim.befine.dev", name: "Sim Confección Eva", role: "clothier" },
  { email: "clothier2@sim.befine.dev", name: "Sim Confección Flor", role: "clothier" },
  { email: "clothier3@sim.befine.dev", name: "Sim Confección Gabi", role: "clothier" },
];

export function simRefusal(input: {
  url: string | undefined;
  confirmHost: string | undefined;
  password: string | undefined;
}): string | null {
  if (!input.url) return "Refusing: SIM_DATABASE_URL is not set.";
  let host: string;
  try {
    host = new URL(input.url).hostname;
  } catch {
    return "Refusing: SIM_DATABASE_URL is not a valid URL.";
  }
  if (!input.confirmHost) return "Refusing: set SIM_CONFIRM_HOST to the database host.";
  if (input.confirmHost !== host)
    return "Refusing: SIM_CONFIRM_HOST does not match the database host.";
  if (!input.password || input.password.length < 12)
    return "Refusing: SIM_PASSWORD is not set (min. 12 characters).";
  return null;
}

async function main() {
  const url = process.env.SIM_DATABASE_URL;
  const password = process.env.SIM_PASSWORD;
  const refusal = simRefusal({ url, confirmHost: process.env.SIM_CONFIRM_HOST, password });
  if (refusal) {
    console.error(refusal);
    process.exit(1);
  }

  const db = createDb(url!);
  const hashed = await hashPassword(password!);
  let created = 0;

  for (const staff of SIM_STAFF) {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, staff.email));
    if (existing) {
      console.log(`  skip  ${staff.email}`);
      continue;
    }

    const id = crypto.randomUUID();
    const now = new Date();
    await db.insert(users).values({
      id,
      name: staff.name,
      email: staff.email,
      emailVerified: true,
      role: staff.role,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(accounts).values({
      id: crypto.randomUUID(),
      userId: id,
      accountId: id,
      providerId: "credential",
      password: hashed,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(employees).values({
      userId: id,
      role: staff.role,
      stylistSubtype: staff.stylistSubtype ?? null,
      dailyRate: staff.dailyRate ?? null,
      expectedWorkDays: 6,
      hiredAt: now,
    });
    console.log(`  created  ${staff.email}`);
    created++;
  }

  console.log(`Done — ${created} created.`);
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
