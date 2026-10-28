"use client";

import { useState } from "react";
import { Banner, PalmLogo, api } from "@/components/ui";

type Props = {
  token: string;
  restaurantName: string;
  table: { number: number };
  options: { google: boolean; phone: boolean };
  loginFailed: boolean;
  onBack: () => void;
  onDone: (g: { id: number; name: string }) => void;
};

export default function LoginScreen(p: Props) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code" | "name">("phone");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [guest, setGuest] = useState<{ id: number; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(p.loginFailed ? "Google sign-in didn't finish. Please try again." : null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () =>
    run(async () => {
      const res = await api<{ devCode?: string }>("/api/auth/otp/request", { body: { phone } });
      setDevCode(res.devCode ?? null);
      setStep("code");
    });

  const verify = () =>
    run(async () => {
      const res = await api<{ guest: { id: number; name: string } }>("/api/auth/otp/verify", { body: { phone, code } });
      setGuest(res.guest);
      // A phone login has no name yet; ask for one so the waiter knows who ordered.
      if (/^\+91\d{10}$/.test(res.guest.name)) setStep("name");
      else p.onDone(res.guest);
    });

  const saveName = () =>
    run(async () => {
      if (name.trim()) await api("/api/guest/name", { body: { name } });
      p.onDone({ id: guest!.id, name: name.trim() || guest!.name });
    });

  return (
    <div className="flex min-h-dvh flex-col bg-palm-700 text-white">
      <div className="px-4 pt-4">
        <button onClick={p.onBack} aria-label="Back to menu" className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
      </div>
      <div className="flex flex-1 flex-col justify-end gap-3.5 px-7 pb-9 pt-6">
        <PalmLogo size={56} />
        <p className="mt-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-marigold">Hundred Palms, Mahoba</p>
        <h1 className="text-[34px] font-extrabold leading-[1.1]">Welcome to {p.restaurantName}</h1>
        <p className="text-base leading-relaxed text-[#D5E3DC]">
          You&apos;re at <strong className="text-white">Table {p.table.number}</strong>. Sign in so your waiter knows who ordered.
        </p>
      </div>
      <div className="flex flex-col gap-3.5 rounded-t-[28px] bg-white px-6 pb-8 pt-7 text-ink">
        {error && <Banner tone="error">{error}</Banner>}

        {step === "phone" && (
          <>
            {p.options.google && (
              <a
                href={`/api/auth/google?next=${encodeURIComponent(`/t/${p.token}`)}`}
                className="flex h-[52px] items-center justify-center gap-2.5 rounded-[14px] border-[1.5px] border-line bg-white text-base font-semibold"
              >
                <GoogleIcon />
                Continue with Google
              </a>
            )}
            {p.options.google && p.options.phone && (
              <div className="flex items-center gap-3 text-[13px] text-ink-3">
                <span className="h-px flex-1 bg-line" />
                or
                <span className="h-px flex-1 bg-line" />
              </div>
            )}
            {p.options.phone && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendCode();
                }}
                className="flex flex-col gap-3.5"
              >
                <label htmlFor="phone" className="text-[13px] font-semibold text-ink-2">
                  Mobile number
                </label>
                <div className="flex gap-2">
                  <span className="flex h-[52px] items-center rounded-[14px] border-[1.5px] border-line px-3.5 font-semibold">+91</span>
                  <input
                    id="phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="98765 43210"
                    className="h-[52px] min-w-0 flex-1 rounded-[14px] border-[1.5px] border-line px-4 text-base outline-none focus:border-palm-700"
                  />
                </div>
                <button disabled={busy || phone.replace(/\D/g, "").length < 10} className="h-[52px] rounded-[14px] bg-palm-700 text-base font-bold text-white disabled:opacity-50">
                  {busy ? "Sending…" : "Send OTP"}
                </button>
              </form>
            )}
            {!p.options.google && !p.options.phone && (
              <Banner>Online sign-in isn&apos;t switched on yet. Please ask your waiter to take your order.</Banner>
            )}
          </>
        )}

        {step === "code" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              verify();
            }}
            className="flex flex-col gap-3.5"
          >
            <label htmlFor="otp" className="text-[13px] font-semibold text-ink-2">
              Enter the 6-digit code sent to {phone}
            </label>
            {devCode && <Banner>Test mode, no SMS sent. Your code is {devCode}.</Banner>}
            <input
              id="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="h-[52px] rounded-[14px] border-[1.5px] border-line px-4 text-center text-2xl font-bold tracking-[0.4em] outline-none focus:border-palm-700"
            />
            <button disabled={busy || code.length !== 6} className="h-[52px] rounded-[14px] bg-palm-700 text-base font-bold text-white disabled:opacity-50">
              {busy ? "Checking…" : "Verify and continue"}
            </button>
            <button type="button" onClick={() => setStep("phone")} className="min-h-11 text-sm font-semibold text-palm-700">
              Change number
            </button>
          </form>
        )}

        {step === "name" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveName();
            }}
            className="flex flex-col gap-3.5"
          >
            <label htmlFor="name" className="text-[13px] font-semibold text-ink-2">
              What should we call you?
            </label>
            <input
              id="name"
              autoComplete="given-name"
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="h-[52px] rounded-[14px] border-[1.5px] border-line px-4 text-base outline-none focus:border-palm-700"
            />
            <button disabled={busy} className="h-[52px] rounded-[14px] bg-palm-700 text-base font-bold text-white disabled:opacity-50">
              Continue
            </button>
          </form>
        )}

        <p className="text-center text-xs leading-relaxed text-ink-3">We use your login only to link your order to your table.</p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M19.6 10.2c0-.7-.1-1.4-.2-2H10v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" fill="#4285F4" />
      <path d="M10 20c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H1.1v2.6A10 10 0 0 0 10 20z" fill="#34A853" />
      <path d="M4.4 12c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V5.4H1.1a10 10 0 0 0 0 9.2L4.4 12z" fill="#FBBC05" />
      <path d="M10 4c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 1.1 5.4L4.4 8C5.2 5.7 7.4 4 10 4z" fill="#EA4335" />
    </svg>
  );
}
