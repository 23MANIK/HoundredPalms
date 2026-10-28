"use client";

import { useState } from "react";
import { formatRupees } from "@/lib/money";
import { Banner, STATUS_LABEL, api } from "@/components/ui";
import { BackHeader } from "./CartScreen";
import type { GuestOrder, GuestOrdersResponse } from "./GuestApp";

type Props = {
  token: string;
  table: { number: number };
  data: GuestOrdersResponse | null;
  refresh: () => Promise<void>;
  onMenu: () => void;
};

const STEPS = ["pending", "approved", "preparing", "served"] as const;

function stepIndex(status: string) {
  if (status === "pending" || status === "returned") return 0;
  if (status === "approved") return 1;
  if (status === "preparing" || status === "ready") return 2;
  return 3;
}

export default function OrdersScreen(p: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const orders = [...(p.data?.orders ?? [])].reverse();

  const askBill = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/t/${p.token}/bill`, { body: {} });
      await p.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pb-10">
      <BackHeader title="My orders" sub={`Table ${p.table.number} · updates on its own`} onBack={p.onMenu} />
      {error && (
        <div className="m-4">
          <Banner tone="error">{error}</Banner>
        </div>
      )}
      {!p.data && <p className="px-6 py-16 text-center text-ink-3">Loading your orders…</p>}
      {p.data && orders.length === 0 && (
        <div className="px-6 py-16 text-center">
          <p className="text-ink-3">You haven&apos;t ordered at this table yet.</p>
          <button onClick={p.onMenu} className="mt-3 min-h-11 font-bold text-palm-700">
            Browse the menu
          </button>
        </div>
      )}

      <div className="flex flex-col gap-4 p-4">
        {orders.map((o) => (
          <OrderCard key={o.id} order={o} refresh={p.refresh} onMenu={p.onMenu} />
        ))}
      </div>

      {p.data?.tab && p.data.bill && (
        <section className="mx-4 rounded-[18px] bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-extrabold">Table bill so far</h2>
              <p className="text-[13px] text-ink-3">Includes everyone at Table {p.table.number}, with GST</p>
            </div>
            <span className="text-xl font-extrabold">{formatRupees(p.data.bill.totalPaise)}</span>
          </div>
          {p.data.tab.billRequested ? (
            <div className="mt-3">
              <Banner tone="ok">The cashier knows you&apos;d like the bill. Someone will bring it shortly.</Banner>
            </div>
          ) : (
            <button
              onClick={askBill}
              disabled={busy || p.data.bill.totalPaise === 0}
              className="mt-3 h-12 w-full rounded-xl border-[1.5px] border-palm-700 font-bold text-palm-700 disabled:opacity-50"
            >
              Ask for the bill
            </button>
          )}
        </section>
      )}

      <div className="flex gap-2.5 p-4">
        <button onClick={p.onMenu} className="h-[50px] flex-1 rounded-[14px] bg-palm-700 font-bold text-white">
          Order more
        </button>
      </div>
    </div>
  );
}

function OrderCard({ order: o, refresh, onMenu }: { order: GuestOrder; refresh: () => Promise<void>; onMenu: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idx = stepIndex(o.status);
  const cancelled = o.status === "cancelled";
  const flagged = o.items.filter((i) => i.status === "unavailable");

  const accept = async (thenMenu: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/orders/${o.id}/accept-removal`, { body: {} });
      await refresh();
      if (thenMenu) onMenu();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const headline =
    o.status === "returned"
      ? "One or more items need your choice"
      : cancelled
        ? "This order was cancelled"
        : o.status === "pending"
          ? "Waiting for your waiter to confirm"
          : o.status === "ready"
            ? "Ready, coming to your table"
            : o.status === "served"
              ? "Served. Enjoy your meal!"
              : o.status === "preparing"
                ? "The kitchen is cooking"
                : `Approved${o.approvedBy ? ` by ${o.approvedBy}` : ""}`;

  return (
    <article className={`overflow-hidden rounded-[18px] bg-white ${o.status === "returned" ? "ring-2 ring-marigold" : ""}`}>
      <div className={`px-4 py-3.5 ${cancelled ? "bg-[#F8E1DC]" : "bg-palm-700 text-white"}`}>
        <p className={`text-xs font-semibold ${cancelled ? "text-nonveg" : "text-marigold"}`}>
          Order #{o.id} · {new Date(o.createdAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
        </p>
        <p className={`text-lg font-extrabold ${cancelled ? "text-ink" : ""}`} aria-live="polite">
          {headline}
        </p>
        {cancelled && o.cancelReason && <p className="text-sm text-ink-2">Reason: {o.cancelReason}</p>}
      </div>

      {!cancelled && (
        <ol className="flex items-center gap-1 px-4 pt-4" aria-label={`Status: ${STATUS_LABEL[o.status]}`}>
          {STEPS.map((s, i) => (
            <li key={s} className="flex flex-1 flex-col items-center gap-1.5">
              <span className={`h-1.5 w-full rounded-full ${i <= idx ? "bg-palm-700" : "bg-line"}`} />
              <span className={`text-[11px] font-semibold ${i <= idx ? "text-palm-700" : "text-ink-3"}`}>
                {["Placed", "Confirmed", "Cooking", "Served"][i]}
              </span>
            </li>
          ))}
        </ol>
      )}

      {o.status === "returned" && (
        <div className="m-4 mb-0 flex flex-col gap-3 rounded-xl border-2 border-marigold p-4">
          <p className="text-base font-extrabold">
            {flagged.map((i) => i.name).join(", ")} {flagged.length === 1 ? "is" : "are"} not available right now
          </p>
          <p className="text-sm text-ink-2">Your waiter checked with the kitchen. The rest of your order is ready to go.</p>
          {error && <Banner tone="error">{error}</Banner>}
          <div className="flex gap-2.5">
            <button onClick={() => accept(false)} disabled={busy} className="h-12 flex-1 rounded-xl border-[1.5px] border-palm-700 font-bold text-palm-700">
              Remove and send
            </button>
            <button onClick={() => accept(true)} disabled={busy} className="h-12 flex-1 rounded-xl bg-palm-700 font-bold text-white">
              Pick another dish
            </button>
          </div>
        </div>
      )}

      <ul className="flex flex-col gap-2 p-4 text-sm">
        {o.items.map((i) => {
          const off = i.status !== "active" || cancelled;
          return (
            <li key={i.id} className={`flex justify-between gap-3 ${off ? "text-[#8B918E]" : ""}`}>
              <span className={off ? "line-through" : ""}>
                {i.qty} × {i.name}
              </span>
              <span>{i.status === "active" ? formatRupees(i.pricePaise * i.qty) : i.status === "unavailable" ? "Unavailable" : "Removed"}</span>
            </li>
          );
        })}
        {o.note && <li className="text-[13px] text-ink-3">Note: {o.note}</li>}
      </ul>
    </article>
  );
}
