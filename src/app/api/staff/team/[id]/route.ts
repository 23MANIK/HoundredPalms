type P<T> = { params: Promise<T> };
import { z } from "zod";
import { handler, idParam, json, readJson, requireStaff } from "@/lib/http";
import { setStaffActive } from "@/lib/domain";

export const PATCH = handler<P<{ id: string }>>(async (req, db, { params }) => {
  const actor = await requireStaff(db, ["manager"]);
  const body = await readJson(req, z.object({ active: z.boolean() }));
  await setStaffActive(db, actor, idParam.parse((await params).id), body.active);
  return json({ ok: true });
});
