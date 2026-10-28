import { pageStaff } from "@/lib/staff-session";
import ManagerPanel from "@/components/staff/ManagerPanel";
import { getDb } from "@/db";
import { restaurants } from "@/db/schema";

export default async function ManagerPage() {
  const me = await pageStaff(["manager"]);
  const rs = await getDb().select().from(restaurants);
  return <ManagerPanel meId={me.id} restaurants={rs.map((r) => ({ id: r.id, name: r.name }))} uploads={!!process.env.BLOB_READ_WRITE_TOKEN} />;
}
