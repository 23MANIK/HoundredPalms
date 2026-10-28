import { redirect } from "next/navigation";
import { getDb } from "@/db";
import type { StaffRole } from "./domain";
import { currentStaff } from "./http";

export const HOME_FOR: Record<StaffRole, string> = {
  waiter: "/staff/waiter",
  kitchen: "/staff/kitchen",
  cashier: "/staff/cashier",
  manager: "/staff/manager",
};

/** For server pages: sends people who aren't signed in, or lack the role, elsewhere. */
export async function pageStaff(roles?: StaffRole[]) {
  const s = await currentStaff(getDb());
  if (!s) redirect("/staff/login");
  if (roles && !roles.includes(s.role)) redirect(HOME_FOR[s.role]);
  return s;
}
