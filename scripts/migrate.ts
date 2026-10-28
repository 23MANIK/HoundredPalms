import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getDb, closeDb } from "../src/db";

async function main() {
  await migrate(getDb(), { migrationsFolder: "./drizzle" });
  console.log("Migrations applied");
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
