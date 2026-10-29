import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { hpPool?: Pool; hpDb?: DB };

export function getDb(): DB {
  if (globalForDb.hpDb) return globalForDb.hpDb;
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set");
  // Hosted databases (Neon) ask for sslmode=require. Check the server
  // certificate fully, so the connection can't be intercepted.
  const url = raw.replace(/sslmode=(prefer|require|verify-ca)\b/, "sslmode=verify-full");
  const pool = new Pool({
    connectionString: url,
    max: Number(process.env.DB_POOL_MAX ?? 5),
  });
  globalForDb.hpPool = pool;
  globalForDb.hpDb = drizzle(pool, { schema });
  return globalForDb.hpDb;
}

export async function closeDb() {
  await globalForDb.hpPool?.end();
  globalForDb.hpPool = undefined;
  globalForDb.hpDb = undefined;
}

export { schema };
