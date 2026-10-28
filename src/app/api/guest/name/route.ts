import { z } from "zod";
import { handler, json, readJson, requireGuest } from "@/lib/http";
import { setGuestName } from "@/lib/auth";

export const POST = handler(async (req, db) => {
  const guest = await requireGuest(db);
  const body = await readJson(req, z.object({ name: z.string().max(60) }));
  await setGuestName(db, guest.id, body.name);
  return json({ ok: true });
});
