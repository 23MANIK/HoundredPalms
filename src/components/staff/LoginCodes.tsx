"use client";

import { useEffect, useRef } from "react";
import { chime, minutesAgo, usePoll } from "./usePoll";

type LoginCode = {
  id: number;
  code: string;
  phoneLast4: string;
  createdAt: string;
  table: { id: number; number: number };
  restaurant: { id: number; name: string };
};

/** Guests who asked for their login code from a waiter. Read the code out at the table. */
export default function LoginCodes({ restaurant }: { restaurant: number | "all" }) {
  const { data } = usePoll<{ codes: LoginCode[] }>("/api/staff/login-codes", 4000);
  const seen = useRef<Set<number> | null>(null);

  useEffect(() => {
    if (!data) return;
    const ids = new Set(data.codes.map((c) => c.id));
    if (seen.current && [...ids].some((id) => !seen.current!.has(id))) chime();
    seen.current = ids;
  }, [data]);

  const codes = (data?.codes ?? []).filter((c) => restaurant === "all" || c.restaurant.id === restaurant);
  if (codes.length === 0) return null;

  return (
    <section aria-labelledby="login-codes" className="mt-4 rounded-[18px] bg-[#E6ECF8] p-4">
      <h2 id="login-codes" className="text-base font-extrabold text-blue">
        Guests waiting for a login code ({codes.length})
      </h2>
      <p className="text-[13px] text-ink-2">Go to the table, check the last 4 digits of their number, and read out the code.</p>
      <ul className="mt-3 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
        {codes.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-3">
            <div className="min-w-0">
              <p className="text-lg font-extrabold">Table {c.table.number}</p>
              <p className="text-sm font-semibold text-ink-2">Number ends {c.phoneLast4}</p>
              <p className="truncate text-xs text-ink-3">
                {c.restaurant.name} · {minutesAgo(c.createdAt)}
              </p>
            </div>
            <span className="shrink-0 font-mono text-2xl font-extrabold tracking-[0.15em]" aria-label={`Code ${c.code.split("").join(" ")}`}>
              {c.code}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
