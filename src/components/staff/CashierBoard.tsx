"use client";

import { useEffect, useState } from "react";
import { computeBill, formatRupees, type Bill } from "@/lib/money";
import { Banner, Button, STATUS_LABEL, api } from "@/components/ui";
import { usePoll } from "./usePoll";

type TableRow = {
  id: number;
  number: number;
  seats: number;
  restaurant: { id: number; name: string };
  tab: { id: number; billRequested: boolean; totalPaise: number } | null;
};

type TabDetail = {
  tab: { id: number; status: string; discountPct: number; paymentMethod: string | null };
  bill: Bill;
  unresolved: number;
  orders: {
    id: number;
    status: string;
    createdAt: string;
    placedBy: string;
    approvedBy: string | null;
    cancelledBy: string | null;
    cancelReason: string | null;
    items: { id: number; name: string; qty: number; pricePaise: number; status: string }[];
    billable: boolean;
  }[];
};

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

export default function CashierBoard({ role }: { role: string }) {
  const { data, error, reload } = usePoll<{ tables: TableRow[]; sales: { total: number; count: number } }>("/api/staff/tables", 5000);
  const [selected, setSelected] = useState<number | null>(null);
  const [receipt, setReceipt] = useState<{ tableId: number; bill: Bill; method: string } | null>(null);
  const tables = data?.tables ?? [];
  const sel = tables.find((t) => t.id === selected) ?? null;
  const groups = [...new Map(tables.map((t) => [t.restaurant.id, t.restaurant.name])).entries()];

  return (
    <main className="mx-auto max-w-[1280px] px-4 pb-10 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">Bills</h1>
        <span className="no-print rounded-full bg-white px-4 py-2 text-sm font-semibold">
          Today: {formatRupees(data?.sales.total ?? 0)} from {data?.sales.count ?? 0} bills
        </span>
      </div>
      {error && (
        <div className="mt-3">
          <Banner tone="error">Can&apos;t reach the server: {error}. Retrying…</Banner>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-start gap-6">
        <div className="no-print flex min-w-0 flex-[999_1_520px] flex-col gap-6">
          <div className="flex flex-wrap gap-4 text-[13px] text-ink-2">
            <Legend color="bg-marigold" label="Bill asked" />
            <Legend color="bg-palm-700" label="Eating" />
            <Legend color="border-[1.5px] border-[#BFC4C1]" label="Free" />
          </div>
          {groups.map(([rid, rname]) => (
            <section key={rid}>
              <h2 className="pb-3 text-lg font-extrabold">{rname}</h2>
              <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(128px,1fr))]">
                {tables
                  .filter((t) => t.restaurant.id === rid)
                  .map((t) => {
                    const asked = t.tab?.billRequested;
                    const busy = !!t.tab;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setSelected(t.id)}
                        aria-label={`${t.restaurant.name} table ${t.number}, ${asked ? "bill asked" : busy ? "eating" : "free"}`}
                        aria-pressed={selected === t.id}
                        className={`flex h-[104px] flex-col justify-between rounded-2xl p-3.5 text-left transition ${
                          asked ? "bg-marigold text-ink" : busy ? "bg-palm-700 text-white" : "border-[1.5px] border-line bg-white text-ink-3"
                        } ${selected === t.id ? "outline outline-[3px] outline-offset-2 outline-ink" : ""}`}
                      >
                        <span className="flex w-full justify-between">
                          <span className="text-xl font-extrabold">T{t.number}</span>
                          <span className="text-xs font-semibold opacity-80">{t.seats} seats</span>
                        </span>
                        <span className="text-[13px] font-bold">{asked ? "Bill asked" : busy ? "Eating" : "Free"}</span>
                        <span className="text-sm font-extrabold">{t.tab ? formatRupees(t.tab.totalPaise) : " "}</span>
                      </button>
                    );
                  })}
              </div>
            </section>
          ))}
        </div>
        <div className="w-full min-w-0 flex-[1_1_380px] lg:sticky lg:top-20">
          {sel ? (
            sel.tab ? (
              <BillPanel
                key={sel.tab.id}
                tabId={sel.tab.id}
                table={sel}
                role={role}
                onClosed={async (bill, method) => {
                  setReceipt({ tableId: sel.id, bill, method });
                  await reload();
                }}
              />
            ) : receipt?.tableId === sel.id ? (
              <div className="flex flex-col gap-3 rounded-[20px] bg-white p-6">
                <h2 className="text-xl font-extrabold">Table {sel.number} paid</h2>
                <Banner tone="ok">
                  Received {formatRupees(receipt.bill.totalPaise)} by {receipt.method.toUpperCase()}. The table is free for the next guests.
                </Banner>
              </div>
            ) : (
              <div className="rounded-[20px] bg-white p-6 text-ink-3">
                {sel.restaurant.name} · Table {sel.number} is free. Nothing to bill.
              </div>
            )
          ) : (
            <div className="rounded-[20px] bg-white p-6 text-ink-3">Pick a table to see its bill.</div>
          )}
        </div>
      </div>
    </main>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-[3px] ${color}`} />
      {label}
    </span>
  );
}

function BillPanel({
  tabId,
  table,
  role,
  onClosed,
}: {
  tabId: number;
  table: TableRow;
  role: string;
  onClosed: (bill: Bill, method: string) => Promise<void>;
}) {
  const { data } = usePoll<TabDetail>(`/api/staff/tabs/${tabId}`, 5000);
  const [discount, setDiscount] = useState(0);
  const [method, setMethod] = useState<"cash" | "upi" | "card" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState<Bill | null>(null);
  const maxDiscount = role === "manager" ? 100 : 20;

  useEffect(() => setError(null), [discount, method]);

  if (!data) return <div className="rounded-[20px] bg-white p-6 text-ink-3">Loading bill…</div>;

  // Show the bill with the discount the cashier is about to apply.
  const sub = data.bill.subtotalPaise;
  const preview = computeBill([{ pricePaise: sub, qty: 1 }], discount, data.bill.gstRateBp);
  const d = preview.discountPaise;
  const half = preview.cgstPaise;
  const total = preview.totalPaise;
  const gstHalfPct = data.bill.gstRateBp / 200;

  const close = async () => {
    if (!method) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ bill: Bill }>(`/api/staff/tabs/${tabId}/close`, { body: { discountPct: discount, paymentMethod: method } });
      setPaid(res.bill);
      await onClosed(res.bill, method);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const lines = data.orders.flatMap((o) =>
    o.items.map((i) => {
      const charged = o.billable && i.status === "active";
      const who =
        o.status === "cancelled"
          ? `Cancelled by ${o.cancelledBy ?? "system"}${o.cancelReason ? `: ${o.cancelReason}` : ""}`
          : i.status === "unavailable"
            ? "Marked unavailable"
            : i.status === "removed"
              ? "Removed (unavailable)"
              : !o.billable
                ? `${STATUS_LABEL[o.status]} · not billed yet`
                : `Ordered by ${o.placedBy}${o.approvedBy && o.approvedBy !== o.placedBy ? ` · approved by ${o.approvedBy}` : ""} · ${time(o.createdAt)}`;
      return { key: i.id, name: i.name, qty: i.qty, amount: charged ? i.pricePaise * i.qty : 0, charged, who };
    }),
  );

  return (
    <section className="flex flex-col gap-4 rounded-[20px] bg-white p-5" aria-label={`Bill for table ${table.number}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[22px] font-extrabold">Table {table.number} bill</h2>
          <p className="text-[13px] text-ink-3">{table.restaurant.name}</p>
        </div>
        {table.tab?.billRequested && <span className="rounded-lg bg-marigold-50 px-2.5 py-1.5 text-xs font-bold text-[#7A4E00]">Bill asked</span>}
      </div>
      <ul className="border-t border-line">
        {lines.map((l) => (
          <li key={l.key} className="flex gap-3 border-b border-[#EEF0EE] py-3">
            <div className="min-w-0 flex-1">
              <p className={`text-[15px] font-bold ${l.charged ? "" : "text-[#8B918E] line-through"}`}>
                {l.qty} × {l.name}
              </p>
              <p className="text-xs text-ink-3">{l.who}</p>
            </div>
            <span className={`text-[15px] font-bold ${l.charged ? "" : "text-[#8B918E]"}`}>{formatRupees(l.amount)}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2 text-sm">
        <Row label="Item total" value={formatRupees(sub)} />
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="disc" className="text-ink-2">
            Discount (%, up to {maxDiscount})
          </label>
          <input
            id="disc"
            type="number"
            min={0}
            max={maxDiscount}
            value={discount}
            onChange={(e) => setDiscount(Math.max(0, Math.min(maxDiscount, Math.floor(Number(e.target.value) || 0))))}
            className="h-10 w-20 rounded-lg border-[1.5px] border-line px-2 text-right"
          />
        </div>
        {d > 0 && <Row label="Discount" value={`− ${formatRupees(d)}`} />}
        <Row label={`CGST ${gstHalfPct}%`} value={formatRupees(half)} />
        <Row label={`SGST ${gstHalfPct}%`} value={formatRupees(half)} />
        <div className="my-1 h-px bg-line" />
        <div className="flex justify-between text-xl font-extrabold">
          <span>Total</span>
          <span>{formatRupees(total)}</span>
        </div>
      </div>
      {data.unresolved > 0 && <Banner>{data.unresolved} order(s) still need a waiter. Approve or cancel them before closing this bill.</Banner>}
      {error && <Banner tone="error">{error}</Banner>}
      {paid ? (
        <Banner tone="ok">Paid {formatRupees(paid.totalPaise)}. Table closed.</Banner>
      ) : (
        <>
          <div className="no-print grid grid-cols-3 gap-2" role="radiogroup" aria-label="Payment method">
            {(["cash", "upi", "card"] as const).map((m) => (
              <button
                key={m}
                role="radio"
                aria-checked={method === m}
                onClick={() => setMethod(m)}
                className={`h-12 rounded-xl border-[1.5px] text-sm font-bold uppercase ${method === m ? "border-palm-700 bg-palm-100 text-palm-700" : "border-line bg-white"}`}
              >
                {m}
              </button>
            ))}
          </div>
          <Button onClick={close} disabled={busy || !method || data.unresolved > 0 || sub === 0} className="no-print h-[52px] text-base">
            {method ? `Mark paid by ${method.toUpperCase()} · close table` : "Choose how they paid"}
          </Button>
        </>
      )}
      <Button variant="outline" onClick={() => window.print()} className="no-print">
        Print bill
      </Button>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-ink-2">{label}</span>
      <span>{value}</span>
    </div>
  );
}
