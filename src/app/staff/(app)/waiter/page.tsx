import { pageStaff } from "@/lib/staff-session";
import WaiterBoard from "@/components/staff/WaiterBoard";

export default async function WaiterPage() {
  await pageStaff(["waiter", "manager"]);
  return <WaiterBoard />;
}
