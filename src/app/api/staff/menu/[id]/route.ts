type P<T> = { params: Promise<T> };
import { z } from "zod";
import { handler, idParam, json, readJson, requireStaff } from "@/lib/http";
import { archiveMenuItem, setMenuItemStock, upsertMenuItem } from "@/lib/domain";
import { itemBody } from "@/lib/schemas";

export const PATCH = handler<P<{ id: string }>>(async (req, db, { params }) => {
  const actor = await requireStaff(db);
  const id = idParam.parse((await params).id);
  const body = await readJson(req, z.union([z.object({ inStock: z.boolean() }), z.object({ archived: z.literal(true) }), itemBody]));
  if ("inStock" in body) await setMenuItemStock(db, actor, id, body.inStock);
  else if ("archived" in body) await archiveMenuItem(db, actor, id);
  else await upsertMenuItem(db, actor, { ...body, id, pricePaise: Math.round(body.priceRupees * 100) });
  return json({ ok: true });
});
