import { handler, json, requireStaff } from "@/lib/http";
import { recentAudit } from "@/lib/domain";

export const GET = handler(async (req, db) => {
  await requireStaff(db, ["manager"]);
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 150);
  return json({ entries: await recentAudit(db, Number.isFinite(limit) ? limit : 150) });
});
