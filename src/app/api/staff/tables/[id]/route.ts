type P<T> = { params: Promise<T> };
import { z } from "zod";
import { handler, idParam, json, readJson, requireStaff } from "@/lib/http";
import { updateTable } from "@/lib/domain";

export const PATCH = handler<P<{ id: string }>>(async (req, db, { params }) => {
  const actor = await requireStaff(db, ["manager"]);
  const body = await readJson(req, z.object({ seats: z.number().int().optional(), active: z.boolean().optional() }));
  await updateTable(db, actor, idParam.parse((await params).id), body);
  return json({ ok: true });
});
