"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/components/ui";

const LINKS: Record<string, { href: string; label: string }[]> = {
  waiter: [{ href: "/staff/waiter", label: "Orders" }],
  kitchen: [{ href: "/staff/kitchen", label: "Kitchen" }],
  cashier: [{ href: "/staff/cashier", label: "Bills" }],
  manager: [
    { href: "/staff/waiter", label: "Orders" },
    { href: "/staff/kitchen", label: "Kitchen" },
    { href: "/staff/cashier", label: "Bills" },
    { href: "/staff/manager", label: "Manage" },
  ],
};

export default function StaffNav({ name, role }: { name: string; role: string }) {
  const path = usePathname();
  const router = useRouter();
  const logout = async () => {
    await api("/api/auth/logout", { body: {} }).catch(() => {});
    router.replace("/staff/login");
  };
  return (
    <header className="no-print sticky top-0 z-30 bg-ink text-white">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5">
        <div className="flex items-baseline gap-3">
          <span className="text-lg font-extrabold">Hundred Palms</span>
          <span className="text-sm capitalize text-[#A9B0AD]">
            {name} · {role}
          </span>
        </div>
        <nav className="flex flex-wrap items-center gap-1">
          {(LINKS[role] ?? []).map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`flex min-h-11 items-center rounded-lg px-3 text-sm font-bold ${path.startsWith(l.href) ? "bg-white/15 text-white" : "text-[#C9CFCC] hover:text-white"}`}
            >
              {l.label}
            </Link>
          ))}
          <button onClick={logout} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-marigold">
            Sign out
          </button>
        </nav>
      </div>
    </header>
  );
}
