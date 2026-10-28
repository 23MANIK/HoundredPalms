import { pageStaff } from "@/lib/staff-session";
import KitchenBoard from "@/components/staff/KitchenBoard";

export default async function KitchenPage() {
  await pageStaff(["kitchen", "manager"]);
  return <KitchenBoard />;
}
