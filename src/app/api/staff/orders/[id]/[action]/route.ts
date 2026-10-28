type P<T> = { params: Promise<T> };
import { z } from "zod";
import { handler, idParam, json, readJson, requireStaff } from "@/lib/http";
import { DomainError, advanceKitchen, approveOrder, cancelOrder, markServed } from "@/lib/domain";

export const POST = handler<P<{ id: string; action: string }>>(async (req, db, { params }) => {
  const { id, action } = await params;
  const orderId = idParam.parse(id);
  const actor = await requireStaff(db);
  const body = await readJson(req, z.object({ reason: z.string().max(200).optional() }));
  switch (action) {
    case "approve":
      return json({ status: await approveOrder(db, actor, orderId) });
    case "kitchen-next":
      return json({ status: await advanceKitchen(db, actor, orderId) });
    case "serve":
      await markServed(db, actor, orderId);
      return json({ status: "served" });
    case "cancel":
      await cancelOrder(db, actor, orderId, body.reason ?? "");
      return json({ status: "cancelled" });
    default:
      throw new DomainError("Not found", 404);
  }
});
