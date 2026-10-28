type P<T> = { params: Promise<T> };
import { z } from "zod";
import { handler, idParam, json, readJson, requireStaff } from "@/lib/http";
import { placeOrder } from "@/lib/domain";

export const POST = handler<P<{ id: string }>>(async (req, db, { params }) => {
  const actor = await requireStaff(db, ["waiter", "manager"]);
  const body = await readJson(
    req,
    z.object({ lines: z.array(z.object({ menuItemId: z.number().int(), qty: z.number().int() })).max(30), note: z.string().max(300).optional() }),
  );
  const order = await placeOrder(db, actor, { tableId: idParam.parse((await params).id), lines: body.lines, note: body.note });
  return json({ id: order.id, status: order.status }, 201);
});
