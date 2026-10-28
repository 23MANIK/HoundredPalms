"use client";

import Link from "next/link";
import { useState } from "react";
import { formatRupees } from "@/lib/money";
import { Banner, Button, DishImage, VegMark, api } from "@/components/ui";
import { usePoll } from "./usePoll";

type Section = "menu" | "tables" | "team" | "settings" | "log";
type Restaurant = { id: number; name: string };

export default function ManagerPanel({ meId, restaurants, uploads }: { meId: number; restaurants: Restaurant[]; uploads: boolean }) {
  const [section, setSection] = useState<Section>("menu");
  return (
    <main className="mx-auto max-w-[1100px] px-4 pb-16 pt-4">
      <h1 className="text-2xl font-extrabold">Manage</h1>
      <nav className="no-scrollbar mt-3 flex gap-1 overflow-x-auto rounded-xl bg-white p-1" role="tablist">
        {(
          [
            ["menu", "Menu"],
            ["tables", "Tables & QR"],
            ["team", "Staff"],
            ["settings", "GST"],
            ["log", "Activity log"],
          ] as [Section, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={section === k}
            onClick={() => setSection(k)}
            className={`min-h-11 shrink-0 rounded-lg px-4 text-sm font-bold ${section === k ? "bg-ink text-white" : "text-ink-2"}`}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="mt-4">
        {section === "menu" && <MenuSection uploads={uploads} />}
        {section === "tables" && <TablesSection restaurants={restaurants} />}
        {section === "team" && <TeamSection meId={meId} />}
        {section === "settings" && <SettingsSection />}
        {section === "log" && <LogSection />}
      </div>
    </main>
  );
}

function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

const input = "h-11 rounded-lg border-[1.5px] border-line bg-white px-3 text-[15px] outline-none focus:border-palm-700";
const label = "flex flex-col gap-1 text-[13px] font-semibold text-ink-2";

// ---------- Menu ----------

type MenuItem = {
  id: number;
  categoryId: number;
  name: string;
  description: string;
  pricePaise: number;
  isVeg: boolean;
  isBestseller: boolean;
  imageUrl: string | null;
  inStock: boolean;
};

function MenuSection({ uploads }: { uploads: boolean }) {
  const { data, reload } = usePoll<{ categories: { id: number; name: string }[]; items: MenuItem[] }>("/api/staff/menu", 60000);
  const [editing, setEditing] = useState<MenuItem | "new" | null>(null);
  const act = useAction();
  if (!data) return <p className="text-ink-3">Loading…</p>;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between gap-3">
        <p className="text-sm text-ink-3">Changes show on guests&apos; phones the next time they open the menu. Prices on bills already placed don&apos;t change.</p>
        <Button onClick={() => setEditing("new")}>+ Add dish</Button>
      </div>
      {editing && (
        <DishForm
          categories={data.categories}
          item={editing === "new" ? null : editing}
          uploads={uploads}
          onDone={async () => {
            setEditing(null);
            await reload();
          }}
          onCancel={() => setEditing(null)}
        />
      )}
      {act.error && <Banner tone="error">{act.error}</Banner>}
      {data.categories.map((c) => {
        const items = data.items.filter((i) => i.categoryId === c.id);
        if (!items.length) return null;
        return (
          <section key={c.id} className="rounded-2xl bg-white p-4">
            <h2 className="pb-2 text-lg font-extrabold">{c.name}</h2>
            <ul className="divide-y divide-line">
              {items.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 py-3">
                  <DishImage src={i.imageUrl} alt={i.name} seed={i.id} className="h-14 w-14 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-bold">
                      <VegMark veg={i.isVeg} size={12} /> {i.name}
                      {i.isBestseller && <span className="rounded bg-marigold-50 px-1.5 text-[11px] text-[#7A4E00]">Bestseller</span>}
                    </p>
                    <p className="text-sm text-ink-3">{formatRupees(i.pricePaise)}</p>
                  </div>
                  <button
                    disabled={act.busy}
                    onClick={() => act.run(async () => {
                      await api(`/api/staff/menu/${i.id}`, { method: "PATCH", body: { inStock: !i.inStock } });
                      await reload();
                    })}
                    className={`min-h-10 rounded-lg px-3 text-sm font-bold ${i.inStock ? "bg-palm-100 text-palm-700" : "bg-[#F8E1DC] text-nonveg"}`}
                  >
                    {i.inStock ? "In stock" : "Sold out"}
                  </button>
                  <Button variant="outline" className="min-h-10" onClick={() => setEditing(i)}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    className="min-h-10 text-nonveg"
                    disabled={act.busy}
                    onClick={() => {
                      if (!confirm(`Remove ${i.name} from the menu?`)) return;
                      act.run(async () => {
                        await api(`/api/staff/menu/${i.id}`, { method: "PATCH", body: { archived: true } });
                        await reload();
                      });
                    }}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function DishForm({
  categories,
  item,
  uploads,
  onDone,
  onCancel,
}: {
  categories: { id: number; name: string }[];
  item: MenuItem | null;
  uploads: boolean;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [f, setF] = useState({
    categoryId: item?.categoryId ?? categories[0]?.id ?? 0,
    name: item?.name ?? "",
    description: item?.description ?? "",
    priceRupees: item ? String(item.pricePaise / 100) : "",
    isVeg: item?.isVeg ?? true,
    isBestseller: item?.isBestseller ?? false,
    imageUrl: item?.imageUrl ?? "",
  });
  const act = useAction();
  const save = () =>
    act.run(async () => {
      const body = { ...f, priceRupees: Number(f.priceRupees), imageUrl: f.imageUrl || null };
      if (item) await api(`/api/staff/menu/${item.id}`, { method: "PATCH", body });
      else await api("/api/staff/menu", { body });
      await onDone();
    });
  const upload = async (file: File) =>
    act.run(async () => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/staff/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setF((x) => ({ ...x, imageUrl: data.url }));
    });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="grid gap-3 rounded-2xl bg-white p-4 ring-2 ring-marigold sm:grid-cols-2"
    >
      <h2 className="text-lg font-extrabold sm:col-span-2">{item ? `Edit ${item.name}` : "Add a dish"}</h2>
      <label className={label}>
        Name
        <input className={input} required maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </label>
      <label className={label}>
        Section
        <select className={input} value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: Number(e.target.value) })}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className={`${label} sm:col-span-2`}>
        Short description
        <input className={input} maxLength={300} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </label>
      <label className={label}>
        Price (₹, before GST)
        <input className={input} required type="number" min={0} step="0.5" inputMode="decimal" value={f.priceRupees} onChange={(e) => setF({ ...f, priceRupees: e.target.value })} />
      </label>
      <div className="flex items-end gap-5 pb-2">
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="h-5 w-5 accent-[#1E8E3E]" checked={f.isVeg} onChange={(e) => setF({ ...f, isVeg: e.target.checked })} />
          Vegetarian
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="h-5 w-5 accent-[#E9B44C]" checked={f.isBestseller} onChange={(e) => setF({ ...f, isBestseller: e.target.checked })} />
          Bestseller
        </label>
      </div>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <span className="text-[13px] font-semibold text-ink-2">Photo</span>
        <div className="flex flex-wrap items-center gap-3">
          <DishImage src={f.imageUrl || null} alt="" seed={item?.id ?? 0} className="h-20 w-20 rounded-xl" />
          {uploads && (
            <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border-[1.5px] border-line px-4 text-sm font-bold">
              Upload photo
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            </label>
          )}
          <input
            className={`${input} min-w-0 flex-1`}
            placeholder="or paste a photo link (https://…)"
            aria-label="Photo link"
            value={f.imageUrl}
            onChange={(e) => setF({ ...f, imageUrl: e.target.value })}
          />
        </div>
        <p className="text-xs text-ink-3">Use a bright, square photo of the real dish. Keep it under 4 MB.</p>
      </div>
      {act.error && (
        <div className="sm:col-span-2">
          <Banner tone="error">{act.error}</Banner>
        </div>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={act.busy}>{item ? "Save changes" : "Add dish"}</Button>
      </div>
    </form>
  );
}

// ---------- Tables ----------

type TableRow = { id: number; number: number; seats: number; restaurant: Restaurant; tab: { id: number } | null };

function TablesSection({ restaurants }: { restaurants: Restaurant[] }) {
  const { data, reload } = usePoll<{ tables: TableRow[] }>("/api/staff/tables", 30000);
  const [form, setForm] = useState({ restaurantId: restaurants[0]?.id ?? 0, number: "", seats: "4" });
  const act = useAction();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-3">Each table gets its own QR code. Print new cards after adding tables.</p>
        <Link href="/staff/manager/qr" className="inline-flex min-h-11 items-center rounded-xl bg-palm-700 px-4 font-bold text-white">
          Print QR cards
        </Link>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          act.run(async () => {
            await api("/api/staff/tables", { body: { restaurantId: form.restaurantId, number: Number(form.number), seats: Number(form.seats) } });
            setForm({ ...form, number: "" });
            await reload();
          });
        }}
        className="flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4"
      >
        <label className={label}>
          Restaurant
          <select className={input} value={form.restaurantId} onChange={(e) => setForm({ ...form, restaurantId: Number(e.target.value) })}>
            {restaurants.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Table number
          <input className={`${input} w-28`} required type="number" min={1} value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} />
        </label>
        <label className={label}>
          Seats
          <input className={`${input} w-24`} required type="number" min={1} max={40} value={form.seats} onChange={(e) => setForm({ ...form, seats: e.target.value })} />
        </label>
        <Button disabled={act.busy}>Add table</Button>
      </form>
      {act.error && <Banner tone="error">{act.error}</Banner>}
      {restaurants.map((r) => (
        <section key={r.id} className="rounded-2xl bg-white p-4">
          <h2 className="pb-2 text-lg font-extrabold">{r.name}</h2>
          <ul className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
            {data?.tables
              .filter((t) => t.restaurant.id === r.id)
              .map((t) => (
                <li key={t.id} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2">
                  <span className="w-16 font-extrabold">T{t.number}</span>
                  <label className="flex items-center gap-1.5 text-sm text-ink-2">
                    Seats
                    <input
                      type="number"
                      min={1}
                      max={40}
                      defaultValue={t.seats}
                      aria-label={`Seats at table ${t.number}`}
                      onBlur={(e) => {
                        const seats = Number(e.target.value);
                        if (seats !== t.seats) act.run(async () => api(`/api/staff/tables/${t.id}`, { method: "PATCH", body: { seats } }).then(reload));
                      }}
                      className="h-9 w-16 rounded-lg border-[1.5px] border-line px-2"
                    />
                  </label>
                  <button
                    className="ml-auto min-h-9 text-sm font-bold text-nonveg disabled:text-ink-3"
                    disabled={act.busy || !!t.tab}
                    title={t.tab ? "Close the open bill first" : undefined}
                    onClick={() => {
                      if (confirm(`Remove table ${t.number}? Its QR code will stop working.`))
                        act.run(async () => api(`/api/staff/tables/${t.id}`, { method: "PATCH", body: { active: false } }).then(reload));
                    }}
                  >
                    Remove
                  </button>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

// ---------- Staff ----------

type StaffRow = { id: number; name: string; phone: string; role: string; active: boolean };

function TeamSection({ meId }: { meId: number }) {
  const { data, reload } = usePoll<{ staff: StaffRow[] }>("/api/staff/team", 60000);
  const [f, setF] = useState({ name: "", phone: "", role: "waiter", pin: "" });
  const act = useAction();
  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          act.run(async () => {
            await api("/api/staff/team", { body: f });
            setF({ name: "", phone: "", role: "waiter", pin: "" });
            await reload();
          });
        }}
        className="flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4"
      >
        <label className={label}>
          Name
          <input className={input} required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </label>
        <label className={label}>
          Mobile number
          <input className={input} required type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </label>
        <label className={label}>
          Role
          <select className={input} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
            <option value="waiter">Waiter</option>
            <option value="kitchen">Kitchen</option>
            <option value="cashier">Cashier</option>
            <option value="manager">Manager</option>
          </select>
        </label>
        <label className={label}>
          PIN (4 to 6 digits)
          <input className={`${input} w-32`} required inputMode="numeric" maxLength={6} value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value.replace(/\D/g, "") })} />
        </label>
        <Button disabled={act.busy}>Add staff</Button>
      </form>
      {act.error && <Banner tone="error">{act.error}</Banner>}
      <ul className="divide-y divide-line rounded-2xl bg-white">
        {data?.staff.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className={`flex-1 font-bold ${s.active ? "" : "text-ink-3 line-through"}`}>{s.name}</span>
            <span className="w-32 text-sm text-ink-3">{s.phone}</span>
            <span className="w-20 text-sm capitalize">{s.role}</span>
            {s.id !== meId && (
              <Button
                variant="outline"
                className="min-h-10"
                disabled={act.busy}
                onClick={() => act.run(async () => api(`/api/staff/team/${s.id}`, { method: "PATCH", body: { active: !s.active } }).then(reload))}
              >
                {s.active ? "Switch off" : "Switch on"}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- GST ----------

function SettingsSection() {
  const { data, reload } = usePoll<{ gstPercent: number }>("/api/staff/settings", 60000);
  const [value, setValue] = useState<string | null>(null);
  const act = useAction();
  const [saved, setSaved] = useState(false);
  if (!data) return <p className="text-ink-3">Loading…</p>;
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setSaved(false);
        if (await act.run(async () => api("/api/staff/settings", { body: { gstPercent: Number(value ?? data.gstPercent) } }))) {
          setSaved(true);
          await reload();
        }
      }}
      className="flex max-w-md flex-col gap-3 rounded-2xl bg-white p-4"
    >
      <label className={label}>
        GST on food (%)
        <input className={input} type="number" step="0.5" min={0} max={28} value={value ?? data.gstPercent} onChange={(e) => setValue(e.target.value)} />
      </label>
      <p className="text-sm text-ink-3">Bills split this equally into CGST and SGST. 5% is the usual rate for restaurants. Check with your accountant before changing it.</p>
      {act.error && <Banner tone="error">{act.error}</Banner>}
      {saved && <Banner tone="ok">Saved. New bills use this rate.</Banner>}
      <Button disabled={act.busy}>Save</Button>
    </form>
  );
}

// ---------- Activity log ----------

type Entry = { id: number; at: string; actorType: string; actorName: string; action: string; tableId: number | null; orderId: number | null; details: Record<string, unknown> };

const ACTIONS: Record<string, string> = {
  "order.placed": "placed an order",
  "order.placed_by_staff": "took an order for a table",
  "order.approved": "approved an order",
  "order.returned_to_guest": "sent an order back (items unavailable)",
  "order.guest_removed_unavailable": "removed unavailable items",
  "order.preparing": "started cooking",
  "order.ready": "marked ready",
  "order.served": "served",
  "order.cancelled": "cancelled an order",
  "item.marked_unavailable": "marked an item unavailable",
  "item.marked_available": "marked an item available",
  "tab.opened": "opened a table bill",
  "tab.bill_requested": "asked for the bill",
  "tab.paid": "closed a bill",
  "menu.item_created": "added a dish",
  "menu.item_updated": "edited a dish",
  "menu.item_removed": "removed a dish",
  "menu.sold_out": "marked a dish sold out",
  "menu.back_in_stock": "put a dish back in stock",
  "table.added": "added a table",
  "table.updated": "changed a table",
  "table.restored": "restored a table",
  "staff.added": "added a staff member",
  "staff.enabled": "switched on a staff login",
  "staff.disabled": "switched off a staff login",
  "staff.login": "signed in",
  "guest.login_phone": "signed in with mobile",
  "guest.login_google": "signed in with Google",
  "settings.gst": "changed GST",
};

function describe(e: Entry) {
  const d = e.details ?? {};
  const bits: string[] = [];
  if (Array.isArray(d.items)) bits.push((d.items as { name: string; qty: number }[]).map((i) => `${i.qty}× ${i.name}`).join(", "));
  if (typeof d.item === "string") bits.push(d.item);
  if (typeof d.name === "string") bits.push(d.name);
  if (typeof d.reason === "string") bits.push(`reason: ${d.reason}`);
  if (typeof d.totalPaise === "number") bits.push(`${formatRupees(d.totalPaise)} by ${String(d.paymentMethod ?? "").toUpperCase()}`);
  if (Array.isArray(d.unavailable)) bits.push(`unavailable: ${(d.unavailable as string[]).join(", ")}`);
  if (typeof d.gstRateBp === "number" && e.action === "settings.gst") bits.push(`${d.gstRateBp / 100}%`);
  return bits.join(" · ");
}

function LogSection() {
  const { data } = usePoll<{ entries: Entry[] }>("/api/staff/audit?limit=200", 15000);
  return (
    <div className="overflow-x-auto rounded-2xl bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-3">
          <tr>
            <th className="px-4 py-3">When</th>
            <th className="px-4 py-3">Who</th>
            <th className="px-4 py-3">What</th>
            <th className="px-4 py-3">Details</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#EEF0EE]">
          {data?.entries.map((e) => (
            <tr key={e.id}>
              <td className="whitespace-nowrap px-4 py-2.5 text-ink-3">
                {new Date(e.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
              </td>
              <td className="px-4 py-2.5 font-semibold">
                {e.actorName}
                <span className="ml-1 text-xs font-normal text-ink-3">{e.actorType}</span>
              </td>
              <td className="px-4 py-2.5">
                {ACTIONS[e.action] ?? e.action}
                {e.orderId ? <span className="text-ink-3"> #{e.orderId}</span> : null}
              </td>
              <td className="px-4 py-2.5 text-ink-2">{describe(e)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
