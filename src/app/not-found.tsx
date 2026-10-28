import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[560px] flex-col items-center justify-center gap-3 px-8 text-center">
      <h1 className="text-2xl font-extrabold">We couldn&apos;t find that table</h1>
      <p className="text-ink-3">The QR code may be old. Please ask your waiter for help.</p>
      <Link href="/" className="mt-2 min-h-11 font-bold text-palm-700">
        Go to the home page
      </Link>
    </main>
  );
}
