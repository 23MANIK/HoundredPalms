import { pageStaff } from "@/lib/staff-session";
import TakeOrder from "@/components/staff/TakeOrder";

export default async function TakeOrderPage() {
  await pageStaff(["waiter", "manager"]);
  return <TakeOrder />;
}
