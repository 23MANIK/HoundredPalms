import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { hpPool?: Pool; hpDb?: DB };

export function getDb(): DB {
  if (globalForDb.hpDb) return globalForDb.hpDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({
    connectionString: url,
    max: Number(process.env.DB_POOL_MAX ?? 5),
    ssl: /sslmode=require/.test(url) ? { rejectUnauthorized: false } : undefined,
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
