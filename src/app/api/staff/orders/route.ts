import { handler, json, requireStaff } from "@/lib/http";
import { listActiveOrders } from "@/lib/domain";

export const GET = handler(async (_req, db) => {
  await requireStaff(db, ["waiter", "kitchen", "manager", "cashier"]);
  return json({ orders: await listActiveOrders(db) });
});
