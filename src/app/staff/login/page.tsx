"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Banner, PalmLogo, api } from "@/components/ui";

export default function StaffLogin() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/staff/login", { body: { phone, pin } });
      router.replace("/staff");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-ink px-4">
      <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-4 rounded-3xl bg-white p-7">
        <div className="text-palm-700">
          <PalmLogo size={44} />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold">Staff sign in</h1>
          <p className="text-sm text-ink-3">Hundred Palms · waiters, kitchen, cashier and manager</p>
        </div>
        {error && <Banner tone="error">{error}</Banner>}
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-2">
          Mobile number
          <input
            type="tel"
            inputMode="numeric"
            autoComplete="username"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="h-12 rounded-xl border-[1.5px] border-line px-4 text-base font-normal text-ink outline-none focus:border-palm-700"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink-2">
          PIN
          <input
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            className="h-12 rounded-xl border-[1.5px] border-line px-4 text-base tracking-[0.3em] text-ink outline-none focus:border-palm-700"
          />
        </label>
        <button disabled={busy || !phone || pin.length < 4} className="h-12 rounded-xl bg-palm-700 font-bold text-white disabled:opacity-50">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
