type P<T> = { params: Promise<T> };
import { z } from "zod";
import { handler, idParam, json, readJson, requireStaff } from "@/lib/http";
import { setItemUnavailable } from "@/lib/domain";

export const POST = handler<P<{ id: string }>>(async (req, db, { params }) => {
  const actor = await requireStaff(db);
  const body = await readJson(req, z.object({ unavailable: z.boolean() }));
  await setItemUnavailable(db, actor, idParam.parse((await params).id), body.unavailable);
  return json({ ok: true });
});
