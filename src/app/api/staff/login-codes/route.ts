import { handler, json, requireStaff } from "@/lib/http";
import { listWaiterCodes } from "@/lib/auth";

export const GET = handler(async (_req, db) => {
  await requireStaff(db, ["waiter", "manager", "cashier"]);
  return json({ codes: await listWaiterCodes(db) });
});
