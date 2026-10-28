import { pageStaff } from "@/lib/staff-session";
import StaffNav from "@/components/staff/StaffNav";

export const dynamic = "force-dynamic";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const s = await pageStaff();
  return (
    <div className="min-h-dvh bg-sand">
      <StaffNav name={s.name} role={s.role} />
      {children}
    </div>
  );
}
