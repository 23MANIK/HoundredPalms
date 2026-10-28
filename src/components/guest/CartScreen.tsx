"use client";

import { useState } from "react";
import { formatRupees, type Bill } from "@/lib/money";
import { Banner, VegMark } from "@/components/ui";
import type { Dish } from "./GuestApp";

type Props = {
  restaurantName: string;
  table: { number: number };
  lines: { dish: Dish; qty: number }[];
  setQty: (id: number, qty: number) => void;
  note: string;
  setNote: (n: string) => void;
  bill: Bill;
  signedIn: boolean;
  onBack: () => void;
  onNeedLogin: () => void;
  onPlace: () => Promise<void>;
};

export function BackHeader({ title, sub, onBack }: { title: string; sub: string; onBack: () => void }) {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-white px-4 py-4">
      <button onClick={onBack} aria-label="Back" className="flex h-11 w-11 items-center justify-center rounded-xl bg-sand">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </button>
      <div>
        <h1 className="text-lg font-extrabold leading-tight">{title}</h1>
        <p className="text-[13px] text-ink-3">{sub}</p>
      </div>
    </header>
  );
}

export default function CartScreen(p: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gstPct = p.bill.gstRateBp / 100;

  const submit = async () => {
    if (!p.signedIn) return p.onNeedLogin();
    setBusy(true);
    setError(null);
    try {
      await p.onPlace();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pb-36">
      <BackHeader title="Your order" sub={`${p.restaurantName} · Table ${p.table.number}`} onBack={p.onBack} />
      {p.lines.length === 0 ? (
        <div className="px-6 py-20 text-center">
          <p className="text-[15px] text-ink-3">Your cart is empty.</p>
          <button onClick={p.onBack} className="mt-4 min-h-11 font-bold text-palm-700">
            Browse the menu
          </button>
        </div>
      ) : (
        <>
          <section className="m-4 rounded-[18px] bg-white px-4 py-1.5">
            <ul>
              {p.lines.map(({ dish, qty }) => (
                <li key={dish.id} className="flex items-center gap-3 border-b border-[#EEF0EE] py-3.5">
                  <VegMark veg={dish.isVeg} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-bold">{dish.name}</p>
                    <p className="text-[13px] text-ink-3">{formatRupees(dish.pricePaise)} each</p>
                  </div>
                  <div className="flex h-9 items-center rounded-[10px] border-[1.5px] border-palm-700 text-palm-700">
                    <button onClick={() => p.setQty(dish.id, qty - 1)} aria-label={`Remove one ${dish.name}`} className="h-9 w-8 text-lg font-bold">
                      −
                    </button>
                    <span className="min-w-[18px] text-center text-sm font-extrabold">{qty}</span>
                    <button onClick={() => p.setQty(dish.id, qty + 1)} aria-label={`Add one more ${dish.name}`} className="h-9 w-8 text-lg font-bold" disabled={qty >= 20}>
                      +
                    </button>
                  </div>
                  <span className="w-16 text-right text-[15px] font-bold">{formatRupees(dish.pricePaise * qty)}</span>
                </li>
              ))}
            </ul>
            <label htmlFor="note" className="block pb-1.5 pt-3.5 text-[13px] font-semibold text-ink-2">
              Cooking instructions (optional)
            </label>
            <textarea
              id="note"
              rows={2}
              maxLength={300}
              value={p.note}
              onChange={(e) => p.setNote(e.target.value)}
              placeholder="Less spicy, no onion…"
              className="mb-3.5 w-full resize-none rounded-xl border-[1.5px] border-line px-3 py-2.5 text-sm outline-none focus:border-palm-700"
            />
          </section>

          <section className="mx-4 flex flex-col gap-2.5 rounded-[18px] bg-white p-4 text-[15px]">
            <Row label="Item total" value={formatRupees(p.bill.subtotalPaise)} />
            <Row label={`GST (${gstPct}%)`} value={formatRupees(p.bill.cgstPaise + p.bill.sgstPaise)} />
            <div className="h-px bg-line" />
            <div className="flex justify-between text-[17px] font-extrabold">
              <span>To pay</span>
              <span>{formatRupees(p.bill.totalPaise)}</span>
            </div>
          </section>

          <div className="m-4">
            <Banner>
              A waiter will check your order before it goes to the kitchen. Once placed, only the waiter can cancel it, so call them if you
              change your mind.
            </Banner>
          </div>
          {error && (
            <div className="mx-4">
              <Banner tone="error">{error}</Banner>
            </div>
          )}

          <div className="fixed inset-x-0 bottom-5 z-30 mx-auto max-w-[560px] px-4">
            <button
              onClick={submit}
              disabled={busy}
              className="h-[60px] w-full rounded-2xl bg-palm-700 text-[17px] font-extrabold text-white shadow-[0_8px_24px_rgba(20,81,61,0.35)] disabled:opacity-70"
            >
              {busy ? "Placing order…" : p.signedIn ? `Place order · ${formatRupees(p.bill.totalPaise)}` : "Sign in to place order"}
            </button>
          </div>
        </>
      )}
    </div>
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
