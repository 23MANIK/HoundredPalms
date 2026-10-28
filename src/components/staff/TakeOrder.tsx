"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatRupees } from "@/lib/money";
import { Banner, Button, VegMark, api } from "@/components/ui";
import { usePoll } from "./usePoll";

type Table = { id: number; number: number; restaurant: { id: number; name: string } };
type Item = { id: number; categoryId: number; name: string; pricePaise: number; isVeg: boolean; inStock: boolean };
type Cat = { id: number; name: string };

export default function TakeOrder() {
  const router = useRouter();
  const tables = usePoll<{ tables: Table[] }>("/api/staff/tables", 60000);
  const menu = usePoll<{ categories: Cat[]; items: Item[] }>("/api/staff/menu", 60000);
  const [tableId, setTableId] = useState<number | null>(null);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [note, setNote] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const table = tables.data?.tables.find((t) => t.id === tableId) ?? null;
  const items = useMemo(() => (menu.data?.items ?? []).filter((i) => !q || i.name.toLowerCase().includes(q.toLowerCase())), [menu.data, q]);
  const lines = Object.entries(cart).map(([id, qty]) => ({ item: menu.data!.items.find((i) => i.id === Number(id))!, qty }));
  const total = lines.reduce((a, l) => a + l.item.pricePaise * l.qty, 0);
  const setQty = (id: number, n: number) =>
    setCart((c) => {
      const next = { ...c };
      if (n <= 0) delete next[id];
      else next[id] = Math.min(n, 20);
      return next;
    });

  const submit = async () => {
    if (!tableId) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/staff/tables/${tableId}/orders`, { body: { lines: lines.map((l) => ({ menuItemId: l.item.id, qty: l.qty })), note: note || undefined } });
      router.push("/staff/waiter");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-[760px] px-4 pb-32 pt-4">
      <h1 className="text-2xl font-extrabold">Take an order</h1>
      <p className="text-sm text-ink-3">For guests ordering in person. It goes straight to the kitchen, approved by you.</p>

      <label className="mt-4 flex flex-col gap-1.5 text-sm font-semibold text-ink-2">
        Table
        <select
          value={tableId ?? ""}
          onChange={(e) => setTableId(e.target.value ? Number(e.target.value) : null)}
          className="h-12 rounded-xl border-[1.5px] border-line bg-white px-3 text-base text-ink"
        >
          <option value="">Choose a table</option>
          {tables.data?.tables.map((t) => (
            <option key={t.id} value={t.id}>
              {t.restaurant.name} · Table {t.number}
            </option>
          ))}
        </select>
      </label>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search dishes"
        aria-label="Search dishes"
        className="mt-4 h-12 w-full rounded-xl border-[1.5px] border-line bg-white px-4 outline-none focus:border-palm-700"
      />
      <ul className="mt-3 divide-y divide-line rounded-2xl bg-white">
        {items.map((i) => {
          const qty = cart[i.id] ?? 0;
          return (
            <li key={i.id} className={`flex items-center gap-3 px-4 py-3 ${i.inStock ? "" : "opacity-50"}`}>
              <VegMark veg={i.isVeg} />
              <span className="flex-1 font-semibold">{i.name}</span>
              <span className="w-16 text-right text-sm text-ink-3">{formatRupees(i.pricePaise)}</span>
              {!i.inStock ? (
                <span className="w-[104px] text-center text-xs font-bold text-ink-3">Sold out</span>
              ) : (
                <div className="flex h-10 w-[104px] items-center justify-between rounded-lg border-[1.5px] border-palm-700 text-palm-700">
                  <button aria-label={`Remove one ${i.name}`} onClick={() => setQty(i.id, qty - 1)} className="h-10 w-9 text-lg font-bold">
                    −
                  </button>
                  <span className="font-extrabold">{qty}</span>
                  <button aria-label={`Add one ${i.name}`} onClick={() => setQty(i.id, qty + 1)} className="h-10 w-9 text-lg font-bold">
                    +
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <label className="mt-4 flex flex-col gap-1.5 text-sm font-semibold text-ink-2">
        Note for the kitchen
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className="h-12 rounded-xl border-[1.5px] border-line bg-white px-4 text-base font-normal text-ink" />
      </label>
      {error && (
        <div className="mt-3">
          <Banner tone="error">{error}</Banner>
        </div>
      )}
      <div className="fixed inset-x-0 bottom-5 z-20 mx-auto max-w-[760px] px-4">
        <Button onClick={submit} disabled={busy || !tableId || lines.length === 0} className="h-14 w-full text-base">
          {table ? `Send for Table ${table.number} · ${formatRupees(total)}` : "Choose a table first"}
        </Button>
      </div>
    </main>
  );
}
