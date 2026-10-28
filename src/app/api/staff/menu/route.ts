import { asc, eq } from "drizzle-orm";
import { handler, json, readJson, requireStaff } from "@/lib/http";
import { upsertMenuItem } from "@/lib/domain";
import { itemBody } from "@/lib/schemas";
import { menuCategories, menuItems } from "@/db/schema";


export const GET = handler(async (_req, db) => {
  await requireStaff(db);
  const [categories, items] = await Promise.all([
    db.select().from(menuCategories).orderBy(asc(menuCategories.sort)),
    db.select().from(menuItems).where(eq(menuItems.archived, false)).orderBy(asc(menuItems.sort), asc(menuItems.id)),
  ]);
  return json({ categories, items });
});

export const POST = handler(async (req, db) => {
  const actor = await requireStaff(db, ["manager"]);
  const b = await readJson(req, itemBody);
  const id = await upsertMenuItem(db, actor, { ...b, pricePaise: Math.round(b.priceRupees * 100) });
  return json({ id }, 201);
});
