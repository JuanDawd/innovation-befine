/**
 * Migration runner using neon-http driver.
 * Run with: node --import tsx/esm src/migrate.ts
 *
 * drizzle-kit migrate uses @neondatabase/serverless (websocket) which
 * doesn't work in this environment. This script uses the neon-http driver instead.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { resolve } from "path";
import { fileURLToPath } from "url";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL environment variable is required");
  process.exit(1);
}

const sql = neon(databaseUrl);
const db = drizzle({ client: sql });

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const migrationsFolder = resolve(__dirname, "../drizzle");

console.log("Running migrations from:", migrationsFolder);

await migrate(db, { migrationsFolder });

console.log("Migrations applied successfully.");
process.exit(0);
