type P<T> = { params: Promise<T> };
import { z } from "zod";
import { handler, idParam, json, readJson, requireStaff } from "@/lib/http";
import { regenerateTableQr, updateTable } from "@/lib/domain";
import { newQrToken } from "@/lib/crypto";

export const PATCH = handler<P<{ id: string }>>(async (req, db, { params }) => {
  const actor = await requireStaff(db, ["manager"]);
  const body = await readJson(
    req,
    z.object({ seats: z.number().int().optional(), active: z.boolean().optional(), regenerateQr: z.literal(true).optional() }),
  );
  const id = idParam.parse((await params).id);
  const { regenerateQr, ...changes } = body;
  if (regenerateQr) await regenerateTableQr(db, actor, id, newQrToken());
  if (changes.seats !== undefined || changes.active !== undefined) await updateTable(db, actor, id, changes);
  return json({ ok: true });
});
