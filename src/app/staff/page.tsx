import { redirect } from "next/navigation";
import { HOME_FOR, pageStaff } from "@/lib/staff-session";

export const dynamic = "force-dynamic";

export default async function StaffHome() {
  const s = await pageStaff();
  redirect(HOME_FOR[s.role]);
}
