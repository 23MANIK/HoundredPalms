type P<T> = { params: Promise<T> };
import { z } from "zod";
import { handler, json, readJson, requireGuest } from "@/lib/http";
import { DomainError, getTableByToken, guestOrdersAtTable, placeOrder } from "@/lib/domain";

const body = z.object({
  lines: z.array(z.object({ menuItemId: z.number().int(), qty: z.number().int() })).max(30),
  note: z.string().max(300).optional(),
});

export const GET = handler<P<{ token: string }>>(async (_req, db, { params }) => {
  const guest = await requireGuest(db);
  const found = await getTableByToken(db, (await params).token);
  if (!found) throw new DomainError("Table not found", 404);
  return json(await guestOrdersAtTable(db, guest.id, found.table.id));
});

export const POST = handler<P<{ token: string }>>(async (req, db, { params }) => {
  const guest = await requireGuest(db);
  const found = await getTableByToken(db, (await params).token);
  if (!found) throw new DomainError("Table not found", 404);
  const input = await readJson(req, body);
  const order = await placeOrder(db, guest, { tableId: found.table.id, lines: input.lines, note: input.note });
  return json({ id: order.id, status: order.status }, 201);
});
