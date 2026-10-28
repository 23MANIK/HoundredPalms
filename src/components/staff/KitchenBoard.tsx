"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Banner, Button, api } from "@/components/ui";
import { chime, minutesAgo, usePoll, type StaffOrder } from "./usePoll";

const COLUMNS = [
  { status: "approved", title: "New", action: "Start cooking" },
  { status: "preparing", title: "Cooking", action: "Ready" },
  { status: "ready", title: "Ready for pickup", action: null },
] as const;

export default function KitchenBoard() {
  const { data, error, reload } = usePoll<{ orders: StaffOrder[] }>("/api/staff/orders", 4000);
  const [showStock, setShowStock] = useState(false);
  const lastNew = useRef<number | null>(null);
  const orders = useMemo(() => data?.orders ?? [], [data]);

  useEffect(() => {
    const n = orders.filter((o) => o.status === "approved").length;
    if (lastNew.current !== null && n > lastNew.current) chime();
    lastNew.current = n;
  }, [orders]);

  return (
    <main className="mx-auto max-w-[1280px] px-4 pb-10 pt-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Kitchen</h1>
        <Button variant="outline" onClick={() => setShowStock((s) => !s)}>
          {showStock ? "Back to orders" : "Mark dishes sold out"}
        </Button>
      </div>
      {error && (
        <div className="mt-3">
          <Banner tone="error">Can&apos;t reach the server: {error}. Retrying…</Banner>
        </div>
      )}
      {showStock ? (
        <StockPanel />
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {COLUMNS.map((col) => {
            const list = orders.filter((o) => o.status === col.status);
            return (
              <section key={col.status} className="rounded-2xl bg-white/60 p-3">
                <h2 className="px-1 pb-3 text-lg font-extrabold">
                  {col.title} ({list.length})
                </h2>
                <div className="flex flex-col gap-3">
                  {list.map((o) => (
                    <Ticket key={o.id} order={o} action={col.action} onDone={reload} />
                  ))}
                  {list.length === 0 && <p className="px-1 pb-4 text-sm text-ink-3">Nothing here.</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}

function Ticket({ order: o, action, onDone }: { order: StaffOrder; action: string | null; onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const items = o.items.filter((i) => i.status === "active");
  return (
    <article className="flex flex-col gap-2 rounded-xl bg-white p-4 ring-1 ring-line">
      <div className="flex items-baseline justify-between">
        <span className="text-xl font-extrabold">T{o.table.number}</span>
        <span className="text-xs text-ink-3">
          {o.restaurant.name} · {minutesAgo(o.updatedAt)}
        </span>
      </div>
      <ul className="text-[17px] font-semibold leading-relaxed">
        {items.map((i) => (
          <li key={i.id}>
            <span className="font-extrabold">{i.qty}×</span> {i.name}
          </li>
        ))}
      </ul>
      {o.note && <p className="rounded-lg bg-marigold-50 px-3 py-2 text-sm font-semibold text-marigold-900">{o.note}</p>}
      {error && <Banner tone="error">{error}</Banner>}
      {action && (
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await api(`/api/staff/orders/${o.id}/kitchen-next`, { body: {} });
              await onDone();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
          className="h-12"
        >
          {action}
        </Button>
      )}
    </article>
  );
}

type Item = { id: number; name: string; inStock: boolean };

export function StockPanel() {
  const { data, reload } = usePoll<{ items: Item[] }>("/api/staff/menu", 30000);
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="mt-4 rounded-2xl bg-white p-4">
      <p className="pb-3 text-sm text-ink-3">Sold-out dishes disappear from guests&apos; carts and can&apos;t be ordered until you switch them back on.</p>
      {error && <Banner tone="error">{error}</Banner>}
      <ul className="grid gap-2 sm:grid-cols-2">
        {data?.items.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2">
            <span className={`font-semibold ${i.inStock ? "" : "text-ink-3 line-through"}`}>{i.name}</span>
            <button
              onClick={async () => {
                setError(null);
                try {
                  await api(`/api/staff/menu/${i.id}`, { method: "PATCH", body: { inStock: !i.inStock } });
                  await reload();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
              aria-pressed={!i.inStock}
              className={`min-h-10 rounded-lg px-3 text-sm font-bold ${i.inStock ? "bg-palm-100 text-palm-700" : "bg-[#F8E1DC] text-nonveg"}`}
            >
              {i.inStock ? "In stock" : "Sold out"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
