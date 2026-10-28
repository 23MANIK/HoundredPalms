type P<T> = { params: Promise<T> };
import { z } from "zod";
import { handler, idParam, json, readJson, requireStaff } from "@/lib/http";
import { closeTab } from "@/lib/domain";

export const POST = handler<P<{ id: string }>>(async (req, db, { params }) => {
  const actor = await requireStaff(db);
  const body = await readJson(req, z.object({ discountPct: z.number().int(), paymentMethod: z.string() }));
  const bill = await closeTab(db, actor, idParam.parse((await params).id), body);
  return json({ bill });
});
