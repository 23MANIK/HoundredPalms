type P<T> = { params: Promise<T> };
import { z } from "zod";
import { handler, json, readJson, requireGuest } from "@/lib/http";
import { DomainError, getTableByToken, requestBill } from "@/lib/domain";

export const POST = handler<P<{ token: string }>>(async (req, db, { params }) => {
  const guest = await requireGuest(db);
  await readJson(req, z.object({}));
  const found = await getTableByToken(db, (await params).token);
  if (!found) throw new DomainError("Table not found", 404);
  await requestBill(db, guest, found.table.id);
  return json({ ok: true });
});
