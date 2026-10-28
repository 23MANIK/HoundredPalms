import { z } from "zod";
import { handler, json, readJson, requireStaff } from "@/lib/http";
import { getGstRateBp, setGstRateBp } from "@/lib/domain";

export const GET = handler(async (_req, db) => {
  await requireStaff(db);
  return json({ gstPercent: (await getGstRateBp(db)) / 100 });
});

export const POST = handler(async (req, db) => {
  const actor = await requireStaff(db, ["manager"]);
  const b = await readJson(req, z.object({ gstPercent: z.number().min(0).max(28) }));
  await setGstRateBp(db, actor, Math.round(b.gstPercent * 100));
  return json({ ok: true });
});
