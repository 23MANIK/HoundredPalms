type P<T> = { params: Promise<T> };
import { handler, idParam, json, requireStaff } from "@/lib/http";
import { getTabDetail } from "@/lib/domain";

export const GET = handler<P<{ id: string }>>(async (_req, db, { params }) => {
  await requireStaff(db, ["cashier", "manager", "waiter"]);
  return json(await getTabDetail(db, idParam.parse((await params).id)));
});
