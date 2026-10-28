"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Banner, Button, VegMark, api } from "@/components/ui";
import { chime, minutesAgo, usePoll, type StaffOrder } from "./usePoll";

type Tab = "new" | "kitchen" | "done";

const WAITER_LABEL: Record<string, string> = {
  pending: "Needs approval",
  returned: "Guest choosing",
  approved: "Sent to kitchen",
  preparing: "Cooking",
  ready: "Ready to serve",
  served: "Served",
  cancelled: "Cancelled",
};

const BADGE: Record<string, string> = {
  pending: "bg-marigold-50 text-[#7A4E00]",
  returned: "bg-[#E6ECF8] text-blue",
  approved: "bg-palm-100 text-palm-700",
  preparing: "bg-palm-100 text-palm-700",
  ready: "bg-marigold text-ink",
  served: "bg-[#EEF0EE] text-ink-2",
  cancelled: "bg-[#F8E1DC] text-nonveg",
};

export default function WaiterBoard() {
  const { data, error, reload } = usePoll<{ orders: StaffOrder[] }>("/api/staff/orders", 4000);
  const [tab, setTab] = useState<Tab>("new");
  const [restaurant, setRestaurant] = useState<number | "all">("all");
  const lastPending = useRef<number | null>(null);

  const orders = useMemo(
    () => (data?.orders ?? []).filter((o) => restaurant === "all" || o.restaurant.id === restaurant),
    [data, restaurant],
  );
  const groups: Record<Tab, StaffOrder[]> = {
    new: orders.filter((o) => o.status === "pending" || o.status === "returned"),
    kitchen: orders.filter((o) => ["approved", "preparing", "ready"].includes(o.status)),
    done: orders.filter((o) => o.status === "served" || o.status === "cancelled").reverse(),
  };
  const restaurants = useMemo(() => {
    const m = new Map<number, string>();
    for (const o of data?.orders ?? []) m.set(o.restaurant.id, o.restaurant.name);
    return [...m.entries()];
  }, [data]);

  useEffect(() => {
    const pending = (data?.orders ?? []).filter((o) => o.status === "pending").length;
    if (lastPending.current !== null && pending > lastPending.current) chime();
    lastPending.current = pending;
  }, [data]);

  return (
    <main className="mx-auto max-w-[1280px] px-4 pb-28 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" className="flex gap-1 rounded-xl bg-white p-1">
          {(
            [
              ["new", "New"],
              ["kitchen", "Kitchen"],
              ["done", "Done"],
            ] as [Tab, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`min-h-11 rounded-lg px-4 text-sm font-bold ${tab === k ? "bg-ink text-white" : "text-ink-2"}`}
            >
              {label} ({groups[k].length})
            </button>
          ))}
        </div>
        {restaurants.length > 1 && (
          <select
            aria-label="Restaurant"
            value={restaurant}
            onChange={(e) => setRestaurant(e.target.value === "all" ? "all" : Number(e.target.value))}
            className="h-11 rounded-xl border-[1.5px] border-line bg-white px-3 text-sm font-semibold"
          >
            <option value="all">Both restaurants</option>
            {restaurants.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <div className="mt-3">
          <Banner tone="error">Can&apos;t reach the server: {error}. Retrying…</Banner>
        </div>
      )}

      <div className="mt-4 grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
        {groups[tab].map((o) => (
          <OrderCard key={o.id} order={o} onChange={reload} />
        ))}
      </div>
      {data && groups[tab].length === 0 && <p className="py-20 text-center text-ink-3">Nothing here right now.</p>}

      <div className="fixed inset-x-0 bottom-5 z-20 mx-auto max-w-[560px] px-4">
        <Link
          href="/staff/waiter/new"
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-palm-700 text-base font-extrabold text-white shadow-[0_8px_24px_rgba(20,81,61,0.3)]"
        >
          + Take an order for a table
        </Link>
      </div>
    </main>
  );
}

function OrderCard({ order: o, onChange }: { order: StaffOrder; onChange: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const flagged = o.items.filter((i) => i.status === "unavailable").length;
  const editable = o.status === "pending";

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className={`flex flex-col gap-3 rounded-[18px] bg-white p-4 ${editable ? "ring-2 ring-marigold" : "ring-1 ring-line"}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-extrabold">Table {o.table.number}</h2>
          <p className="text-[13px] text-ink-3">
            {o.restaurant.name} · #{o.id} · {o.guest} · {minutesAgo(o.createdAt)}
          </p>
        </div>
        <span className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-bold ${BADGE[o.status]}`}>{WAITER_LABEL[o.status]}</span>
      </div>
      <ul>
        {o.items.map((i) => {
          const off = i.status !== "active";
          return (
            <li key={i.id} className="flex items-center gap-2.5 border-t border-[#EEF0EE] py-2.5">
              <VegMark veg={i.isVeg} size={12} />
              <span className={`w-8 shrink-0 font-extrabold ${off ? "text-[#8B918E]" : ""}`}>{i.qty}×</span>
              <span className={`flex-1 font-semibold ${off ? "text-[#8B918E] line-through" : ""}`}>{i.name}</span>
              {editable && i.status !== "removed" && (
                <button
                  disabled={busy}
                  onClick={() => act(() => api(`/api/staff/order-items/${i.id}`, { body: { unavailable: i.status === "active" } }))}
                  aria-pressed={i.status === "unavailable"}
                  className={`min-h-9 rounded-lg border-[1.5px] px-3 text-[13px] font-bold ${
                    i.status === "unavailable" ? "border-[#E4B3A8] bg-[#F8E1DC] text-nonveg" : "border-[#BFD6CB] bg-white text-palm-700"
                  }`}
                >
                  {i.status === "unavailable" ? "Unavailable" : "In stock"}
                </button>
              )}
              {i.status === "removed" && <span className="text-xs text-ink-3">guest removed</span>}
            </li>
          );
        })}
      </ul>
      {o.note && <p className="rounded-lg bg-sand px-3 py-2 text-[13px] text-ink-2">Note: {o.note}</p>}
      {o.status === "returned" && <Banner>Waiting for the guest to choose. Their phone is showing the unavailable items.</Banner>}
      {error && <Banner tone="error">{error}</Banner>}

      {editable && (
        <Button variant={flagged ? "blue" : "primary"} disabled={busy} onClick={() => act(() => api(`/api/staff/orders/${o.id}/approve`, { body: {} }))} className="h-12">
          {flagged ? `Send back to guest (${flagged} unavailable)` : "Approve · send to kitchen"}
        </Button>
      )}
      {["approved", "preparing", "ready"].includes(o.status) && (
        <Button variant="outline" disabled={busy} onClick={() => act(() => api(`/api/staff/orders/${o.id}/serve`, { body: {} }))} className="h-12 border-palm-700 text-palm-700">
          Mark served
        </Button>
      )}
      {!["served", "cancelled"].includes(o.status) &&
        (cancelling ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              act(() => api(`/api/staff/orders/${o.id}/cancel`, { body: { reason } }));
            }}
            className="flex flex-col gap-2 rounded-xl border-[1.5px] border-[#E4B3A8] p-3"
          >
            <label className="text-[13px] font-semibold text-ink-2" htmlFor={`reason-${o.id}`}>
              Why is this order being cancelled?
            </label>
            <input
              id={`reason-${o.id}`}
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Guest changed their mind"
              className="h-11 rounded-lg border-[1.5px] border-line px-3 text-sm outline-none focus:border-nonveg"
            />
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setCancelling(false)}>
                Keep order
              </Button>
              <Button variant="danger" className="flex-1" disabled={busy || !reason.trim()}>
                Cancel order
              </Button>
            </div>
          </form>
        ) : (
          <button onClick={() => setCancelling(true)} className="min-h-11 text-sm font-bold text-nonveg">
            Cancel order (guest asked)
          </button>
        ))}
    </article>
  );
}
