/**
 * Development seed script — T011
 *
 * Creates one user per role so developers can log in as any role without manual setup.
 * For stylists, seeds one user per subtype (5 total).
 *
 * Run: pnpm --filter @befine/db db:seed
 *
 * Safe to run multiple times — skips existing emails.
 */

import { hashPassword } from "@better-auth/utils/password";
import { eq } from "drizzle-orm";
import { accounts, users, employees } from "./schema";
import { createDb } from "./index";

type SeedUser = {
  email: string;
  name: string;
  role: string;
  password: string;
  stylistSubtype?: string;
  dailyRate?: number; // secretaries only
  expectedWorkDays?: number;
};

function getEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

const seedUsers: SeedUser[] = [
  {
    email: "admin@befine.dev",
    name: "Admin",
    role: "cashier_admin",
    password: getEnv("SEED_ADMIN_PASSWORD", "Admin123!"),
  },
  {
    email: "secretary@befine.dev",
    name: "Secretaria",
    role: "secretary",
    password: getEnv("SEED_SECRETARY_PASSWORD", "Secretary123!"),
    dailyRate: 50000,
  },
  {
    email: "manicurist@befine.dev",
    name: "Manicurista",
    role: "stylist",
    password: getEnv("SEED_STYLIST_PASSWORD", "Stylist123!"),
    stylistSubtype: "manicurist",
  },
  {
    email: "spa@befine.dev",
    name: "Spa Manager",
    role: "stylist",
    password: getEnv("SEED_STYLIST_PASSWORD", "Stylist123!"),
    stylistSubtype: "spa_manager",
  },
  {
    email: "hairdresser@befine.dev",
    name: "Estilista",
    role: "stylist",
    password: getEnv("SEED_STYLIST_PASSWORD", "Stylist123!"),
    stylistSubtype: "hairdresser",
  },
  {
    email: "masseuse@befine.dev",
    name: "Masajista",
    role: "stylist",
    password: getEnv("SEED_STYLIST_PASSWORD", "Stylist123!"),
    stylistSubtype: "masseuse",
  },
  {
    email: "makeup@befine.dev",
    name: "Maquilladora",
    role: "stylist",
    password: getEnv("SEED_STYLIST_PASSWORD", "Stylist123!"),
    stylistSubtype: "makeup_artist",
  },
  {
    email: "clothier@befine.dev",
    name: "Confeccionista",
    role: "clothier",
    password: getEnv("SEED_CLOTHIER_PASSWORD", "Clothier123!"),
  },
];

async function seed() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }

  const db = createDb(databaseUrl);
  let created = 0;
  let skipped = 0;

  for (const seedUser of seedUsers) {
    // Check user existence
    const existingUser = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, seedUser.email));

    // neon-http doesn't support transactions, so we use fine-grained idempotency:
    // check both tables independently so a partial prior failure is recoverable.
    if (existingUser.length > 0) {
      const userId = existingUser[0]!.id;
      // Ensure account row also exists (handles orphaned-user recovery)
      const existingAccount = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(eq(accounts.userId, userId));

      if (existingAccount.length > 0) {
        // Both user and account exist — check employee row too
        const existingEmployee = await db
          .select({ id: employees.id })
          .from(employees)
          .where(eq(employees.userId, userId));

        if (existingEmployee.length === 0) {
          // Backfill missing employee row
          const now = new Date();
          await db.insert(employees).values({
            userId,
            role: seedUser.role,
            stylistSubtype:
              seedUser.stylistSubtype as (typeof employees.$inferInsert)["stylistSubtype"],
            dailyRate: seedUser.dailyRate ?? null,
            expectedWorkDays: seedUser.expectedWorkDays ?? 5,
            hiredAt: now,
          });
          console.log(`  repaired  ${seedUser.email} (employee row was missing)`);
        } else {
          console.log(`  skip  ${seedUser.email} (already exists)`);
        }
        skipped++;
        continue;
      }

      // User exists but account is missing — insert account + employee
      const hashedPassword = await hashPassword(seedUser.password);
      const now = new Date();
      await db.insert(accounts).values({
        id: crypto.randomUUID(),
        userId,
        accountId: userId,
        providerId: "credential",
        password: hashedPassword,
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(employees).values({
        userId,
        role: seedUser.role,
        stylistSubtype:
          seedUser.stylistSubtype as (typeof employees.$inferInsert)["stylistSubtype"],
        dailyRate: seedUser.dailyRate ?? null,
        expectedWorkDays: seedUser.expectedWorkDays ?? 5,
        hiredAt: now,
      });
      console.log(`  repaired  ${seedUser.email} (account + employee were missing)`);
      created++;
      continue;
    }

    const id = crypto.randomUUID();
    const hashedPassword = await hashPassword(seedUser.password);
    const now = new Date();

    await db.insert(users).values({
      id,
      name: seedUser.name,
      email: seedUser.email,
      emailVerified: true,
      role: seedUser.role,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(accounts).values({
      id: crypto.randomUUID(),
      userId: id,
      accountId: id,
      providerId: "credential",
      password: hashedPassword,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(employees).values({
      userId: id,
      role: seedUser.role,
      stylistSubtype: seedUser.stylistSubtype as (typeof employees.$inferInsert)["stylistSubtype"],
      dailyRate: seedUser.dailyRate ?? null,
      expectedWorkDays: seedUser.expectedWorkDays ?? 5,
      hiredAt: now,
    });

    const subtypeNote = seedUser.stylistSubtype ? ` [${seedUser.stylistSubtype}]` : "";
    console.log(`  created  ${seedUser.email} (${seedUser.role}${subtypeNote})`);
    created++;
  }

  console.log(`\nDone — ${created} created, ${skipped} skipped.`);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
