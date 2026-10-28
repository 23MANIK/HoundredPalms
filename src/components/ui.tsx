"use client";

import type { ReactNode } from "react";

export function VegMark({ veg, size = 14 }: { veg: boolean; size?: number }) {
  const color = veg ? "var(--color-veg)" : "var(--color-nonveg)";
  return (
    <span
      role="img"
      aria-label={veg ? "Vegetarian" : "Non-vegetarian"}
      className="inline-flex shrink-0 items-center justify-center rounded-[3px] bg-white"
      style={{ width: size, height: size, border: `1.5px solid ${color}` }}
    >
      {veg ? (
        <span className="rounded-full" style={{ width: size * 0.43, height: size * 0.43, background: color }} />
      ) : (
        <svg width={size * 0.57} height={size * 0.5} viewBox="0 0 8 7" aria-hidden="true">
          <path d="M4 0L8 7H0z" fill={color} />
        </svg>
      )}
    </span>
  );
}

const TILE_COLORS = [
  ["#F3D3BD", "#B5552B"],
  ["#F1D7A6", "#C9642A"],
  ["#EBDDC5", "#A9773A"],
  ["#E2E6C8", "#8E7A2E"],
  ["#F1D2D5", "#A84A55"],
  ["#D3E6E2", "#3F7F73"],
];

/** Dish photo, or a warm illustrated tile until the hotel adds a real photo. */
export function DishImage({
  src,
  alt,
  seed,
  className = "",
  big = false,
}: {
  src: string | null;
  alt: string;
  seed: number;
  className?: string;
  big?: boolean;
}) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} loading="lazy" decoding="async" className={`object-cover ${className}`} />;
  }
  const [bg, ink] = TILE_COLORS[Math.abs(seed) % TILE_COLORS.length];
  return (
    <div className={`flex items-center justify-center ${className}`} style={{ background: bg }} aria-hidden="true">
      <svg width={big ? 120 : 64} height={big ? 76 : 40} viewBox="0 0 64 40" fill="none">
        <path d="M4 16c0 12 12 20 28 20s28-8 28-20H4z" fill="#FFFFFF" fillOpacity="0.92" />
        <ellipse cx="32" cy="16" rx="28" ry="6" fill={ink} />
        <circle cx="24" cy="15" r="2.6" fill="#F4E6C8" />
        <circle cx="35" cy="14" r="2.6" fill="#F4E6C8" />
        <circle cx="43" cy="17" r="2.2" fill="#F4E6C8" />
        <path d="M26 8c-2-3 2-5 0-8M36 8c-2-3 2-5 0-8" stroke={ink} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "outline" | "ghost" | "danger" | "blue" }) {
  const styles = {
    primary: "bg-palm-700 text-white hover:bg-palm-900 disabled:bg-ink-3/40",
    outline: "border-[1.5px] border-line bg-white text-ink hover:border-ink-3 disabled:opacity-50",
    ghost: "bg-transparent text-palm-700 hover:bg-palm-50 disabled:opacity-50",
    danger: "bg-nonveg text-white hover:brightness-95 disabled:opacity-50",
    blue: "bg-blue text-white hover:brightness-95 disabled:opacity-50",
  }[variant];
  return (
    <button
      {...props}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-bold transition disabled:cursor-not-allowed ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Banner({ tone = "info", children }: { tone?: "info" | "error" | "ok"; children: ReactNode }) {
  const cls = {
    info: "bg-marigold-50 text-marigold-900",
    error: "bg-[#F8E1DC] text-nonveg",
    ok: "bg-palm-100 text-palm-700",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${cls}`}>
      {children}
    </div>
  );
}

export async function api<T = unknown>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? (init?.body !== undefined ? "POST" : "GET"),
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Something went wrong");
  return data as T;
}

export function PalmLogo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" aria-hidden="true">
      <circle cx="28" cy="28" r="27" stroke="#E9B44C" strokeWidth="2" />
      <path d="M28 44V24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path
        d="M28 24C24 16 16 15 12 18M28 24C32 16 40 15 44 18M28 24C22 20 15 23 13 28M28 24C34 20 41 23 43 28M28 24C27 17 29 12 32 10"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export const STATUS_LABEL: Record<string, string> = {
  pending: "Waiting for waiter",
  returned: "Needs your choice",
  approved: "Approved",
  preparing: "Cooking",
  ready: "Ready to serve",
  served: "Served",
  cancelled: "Cancelled",
};
