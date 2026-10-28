import { pageStaff } from "@/lib/staff-session";
import CashierBoard from "@/components/staff/CashierBoard";

export default async function CashierPage() {
  const s = await pageStaff(["cashier", "manager"]);
  return <CashierBoard role={s.role} />;
}
