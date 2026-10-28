"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { formatRupees } from "@/lib/money";
import { DishImage, VegMark } from "@/components/ui";
import type { Cart, Category, Dish } from "./GuestApp";

type Props = {
  restaurant: { name: string; tagline: string; vegOnly: boolean };
  table: { number: number };
  menu: Category[];
  cart: Cart;
  setQty: (id: number, qty: number) => void;
  guestName: string | null;
  onSignIn: () => void;
  ordersBadge: { count: number; alert: boolean };
  onOrders: () => void;
  footer: ReactNode;
};

export default function MenuScreen(p: Props) {
  const [query, setQuery] = useState("");
  const [vegOnly, setVegOnly] = useState(false);
  const [active, setActive] = useState<number | null>(p.menu[0]?.id ?? null);
  const sectionRefs = useRef(new Map<number, HTMLElement>());
  const chipRefs = useRef(new Map<number, HTMLButtonElement>());
  const navRef = useRef<HTMLElement>(null);

  const q = query.trim().toLowerCase();
  const sections = useMemo(
    () =>
      p.menu
        .map((c) => ({
          ...c,
          items: c.items.filter(
            (d) => (!vegOnly || d.isVeg) && (!q || d.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q)),
          ),
        }))
        .filter((c) => c.items.length > 0),
    [p.menu, vegOnly, q],
  );
  const bestsellers = useMemo(
    () => p.menu.flatMap((c) => c.items).filter((d) => d.isBestseller && d.inStock && (!vegOnly || d.isVeg)),
    [p.menu, vegOnly],
  );

  // Highlight the category chip for the section on screen.
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(Number((visible[0].target as HTMLElement).dataset.cat));
      },
      { rootMargin: "-120px 0px -60% 0px" },
    );
    sectionRefs.current.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [sections]);

  // Keep the active chip in view by scrolling the chip bar sideways only,
  // never the page itself.
  useEffect(() => {
    const chip = active != null ? chipRefs.current.get(active) : null;
    const bar = navRef.current;
    if (chip && bar) bar.scrollTo({ left: chip.offsetLeft - bar.clientWidth / 2 + chip.clientWidth / 2, behavior: "smooth" });
  }, [active]);

  const jump = (id: number) => {
    const el = sectionRefs.current.get(id);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 70, behavior: "smooth" });
  };

  return (
    <div className="pb-32">
      <header className="bg-palm-700 px-5 pb-5 pt-5 text-white">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-marigold">Hundred Palms</p>
            <h1 className="truncate text-[22px] font-extrabold leading-tight">{p.restaurant.name}</h1>
            {p.restaurant.tagline && <p className="text-sm text-[#CFE1D8]">{p.restaurant.tagline}</p>}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <span className="rounded-full bg-white/15 px-3.5 py-2 text-sm font-bold">Table {p.table.number}</span>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-2 text-sm">
          {p.guestName ? (
            <span className="truncate text-[#CFE1D8]">
              Hi, <strong className="text-white">{p.guestName}</strong>
            </span>
          ) : (
            <button onClick={p.onSignIn} className="min-h-11 font-bold text-marigold underline-offset-4 hover:underline">
              Sign in to order
            </button>
          )}
          {p.guestName && (
            <button
              onClick={p.onOrders}
              className={`relative min-h-11 rounded-full px-4 font-bold ${p.ordersBadge.alert ? "bg-marigold text-ink" : "bg-white/15 text-white"}`}
            >
              My orders{p.ordersBadge.count > 0 ? ` (${p.ordersBadge.count})` : ""}
              {p.ordersBadge.alert && <span className="sr-only"> One order needs your choice</span>}
            </button>
          )}
        </div>
        <div className="mt-4 flex gap-2.5">
          <label className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-xl bg-white px-3.5 text-ink-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-4-4" />
            </svg>
            <span className="sr-only">Search dishes</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search dishes"
              className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3"
            />
          </label>
          {p.restaurant.vegOnly ? (
            <span className="flex h-12 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl bg-palm-100 px-3 text-sm font-bold text-palm-700">
              <VegMark veg /> Pure veg
            </span>
          ) : (
            <button
              onClick={() => setVegOnly((v) => !v)}
              aria-pressed={vegOnly}
              className={`flex h-12 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 text-sm font-bold transition ${vegOnly ? "bg-palm-100 text-palm-700" : "bg-white/15 text-white"}`}
            >
              <VegMark veg /> Veg only
            </button>
          )}
        </div>
      </header>

      <nav ref={navRef} aria-label="Menu sections" className="no-scrollbar sticky top-0 z-20 flex gap-2 overflow-x-auto bg-sand/95 px-5 py-3 backdrop-blur">
        {sections.map((c) => (
          <button
            key={c.id}
            ref={(el) => {
              if (el) chipRefs.current.set(c.id, el);
            }}
            onClick={() => jump(c.id)}
            className={`h-10 shrink-0 rounded-full border-[1.5px] px-4 text-sm transition ${
              active === c.id ? "border-palm-700 bg-palm-700 font-bold text-white" : "border-line bg-white font-semibold text-ink"
            }`}
          >
            {c.name}
          </button>
        ))}
      </nav>

      {!q && bestsellers.length > 0 && (
        <section aria-labelledby="bestsellers" className="pt-2">
          <h2 id="bestsellers" className="px-5 pb-3 text-xl font-extrabold">
            Bestsellers
          </h2>
          <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2">
            {bestsellers.map((d) => (
              <article key={d.id} className="w-[260px] shrink-0 snap-start overflow-hidden rounded-[20px] bg-white shadow-[0_1px_2px_rgba(20,40,30,0.06)]">
                <DishImage src={d.imageUrl} alt={d.name} seed={d.id} big className="h-[150px] w-full" />
                <div className="flex items-end gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <VegMark veg={d.isVeg} />
                      <h3 className="truncate text-base font-extrabold">{d.name}</h3>
                    </div>
                    <p className="mt-1 text-[15px] font-bold">{formatRupees(d.pricePaise)}</p>
                  </div>
                  <QtyControl dish={d} qty={p.cart[d.id] ?? 0} setQty={p.setQty} compact />
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {sections.map((c) => (
        <section
          key={c.id}
          data-cat={c.id}
          ref={(el) => {
            if (el) sectionRefs.current.set(c.id, el);
            else sectionRefs.current.delete(c.id);
          }}
          aria-labelledby={`cat-${c.id}`}
        >
          <div className="flex items-baseline justify-between px-5 pb-1 pt-6">
            <h2 id={`cat-${c.id}`} className="text-xl font-extrabold">
              {c.name}
            </h2>
            <span className="text-[13px] text-ink-3">
              {c.items.length} {c.items.length === 1 ? "dish" : "dishes"}
            </span>
          </div>
          <ul>
            {c.items.map((d) => (
              <DishRow key={d.id} dish={d} qty={p.cart[d.id] ?? 0} setQty={p.setQty} />
            ))}
          </ul>
        </section>
      ))}

      {sections.length === 0 && <p className="px-5 py-16 text-center text-[15px] text-ink-3">No dishes match your search.</p>}

      <p className="px-5 pt-10 text-center text-xs text-ink-3">Prices exclude GST. Ask your waiter about allergens.</p>

      {p.footer && <div className="fixed inset-x-0 bottom-5 z-30 mx-auto max-w-[560px] px-4">{p.footer}</div>}
    </div>
  );
}

function DishRow({ dish: d, qty, setQty }: { dish: Dish; qty: number; setQty: (id: number, q: number) => void }) {
  return (
    <li className={`mx-5 flex gap-4 border-b border-line pb-7 pt-5 ${d.inStock ? "" : "opacity-60"}`}>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <VegMark veg={d.isVeg} />
          {d.isBestseller && <span className="rounded-md bg-marigold-50 px-2 py-0.5 text-[11px] font-bold text-[#7A4E00]">Bestseller</span>}
        </div>
        <h3 className="text-[17px] font-bold leading-snug">{d.name}</h3>
        <p className="text-[15px] font-semibold">{formatRupees(d.pricePaise)}</p>
        {d.description && <p className="text-[13px] leading-relaxed text-ink-3">{d.description}</p>}
      </div>
      <div className="relative w-32 shrink-0">
        <DishImage src={d.imageUrl} alt={d.name} seed={d.id} className="h-[120px] w-32 rounded-2xl" />
        <div className="absolute inset-x-3 -bottom-4">
          <QtyControl dish={d} qty={qty} setQty={setQty} />
        </div>
      </div>
    </li>
  );
}

function QtyControl({ dish, qty, setQty, compact }: { dish: Dish; qty: number; setQty: (id: number, q: number) => void; compact?: boolean }) {
  if (!dish.inStock) {
    return <span className="flex h-10 items-center justify-center rounded-[10px] border border-line bg-white px-3 text-xs font-bold text-ink-3">Sold out</span>;
  }
  if (qty === 0) {
    return (
      <button
        onClick={() => setQty(dish.id, 1)}
        aria-label={`Add ${dish.name}`}
        className={`h-10 rounded-[10px] border border-line bg-white font-extrabold text-palm-700 shadow-[0_2px_6px_rgba(20,40,30,0.12)] transition active:scale-95 ${compact ? "px-5" : "w-full"}`}
      >
        ADD
      </button>
    );
  }
  return (
    <div className={`flex h-10 items-center justify-between rounded-[10px] bg-palm-700 text-white shadow-[0_2px_6px_rgba(20,40,30,0.18)] ${compact ? "w-[104px]" : "w-full"}`}>
      <button onClick={() => setQty(dish.id, qty - 1)} aria-label={`Remove one ${dish.name}`} className="h-10 w-9 text-xl font-bold">
        −
      </button>
      <span className="text-[15px] font-extrabold" aria-live="polite">
        {qty}
      </span>
      <button onClick={() => setQty(dish.id, qty + 1)} aria-label={`Add one more ${dish.name}`} className="h-10 w-9 text-xl font-bold" disabled={qty >= 20}>
        +
      </button>
    </div>
  );
}
