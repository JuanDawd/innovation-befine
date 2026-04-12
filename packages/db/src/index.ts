import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

// Required for neon-serverless to work in Node.js (not just edge runtime)
import ws from "ws";

neonConfig.webSocketConstructor = ws;

import * as schema from "./schema";

export function createDb(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });
  return drizzle({ client: pool, schema });
}

export type Database = ReturnType<typeof createDb>;

export { schema };
