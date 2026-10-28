import { z } from "zod";
import { handler, json, readJson, requireStaff } from "@/lib/http";
import { addTable, listTablesWithTabs, todaysSales } from "@/lib/domain";
import { newQrToken } from "@/lib/crypto";

export const GET = handler(async (_req, db) => {
  await requireStaff(db);
  const [tables, sales] = await Promise.all([listTablesWithTabs(db), todaysSales(db)]);
  return json({ tables, sales });
});

export const POST = handler(async (req, db) => {
  const actor = await requireStaff(db, ["manager"]);
  const body = await readJson(req, z.object({ restaurantId: z.number().int(), number: z.number().int(), seats: z.number().int() }));
  const id = await addTable(db, actor, { ...body, qrToken: newQrToken() });
  return json({ id }, 201);
});
