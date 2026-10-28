import Link from "next/link";
import { PalmLogo } from "@/components/ui";

export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col bg-palm-700 text-white">
      <div className="mx-auto flex w-full max-w-[560px] flex-1 flex-col justify-end gap-4 px-7 pb-10">
        <PalmLogo size={64} />
        <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-marigold">Chhatarpur Road, Mahoba</p>
        <h1 className="text-[40px] font-extrabold leading-[1.05]">Hundred Palms</h1>
        <p className="text-lg leading-relaxed text-[#D5E3DC]">
          To order, scan the QR code on your table with your phone camera. The menu opens right here, no app needed.
        </p>
      </div>
      <div className="mx-auto w-full max-w-[560px] rounded-t-[28px] bg-white px-7 py-7 text-ink">
        <p className="text-sm text-ink-3">Working at Hundred Palms?</p>
        <Link href="/staff/login" className="mt-2 inline-flex min-h-11 items-center font-bold text-palm-700">
          Staff sign in →
        </Link>
      </div>
    </main>
  );
}
