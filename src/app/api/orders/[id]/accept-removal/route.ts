type P<T> = { params: Promise<T> };
import { z } from "zod";
import { handler, idParam, json, readJson, requireGuest } from "@/lib/http";
import { guestAcceptRemoval } from "@/lib/domain";

export const POST = handler<P<{ id: string }>>(async (req, db, { params }) => {
  const guest = await requireGuest(db);
  await readJson(req, z.object({}));
  const status = await guestAcceptRemoval(db, guest, idParam.parse((await params).id));
  return json({ status });
});
