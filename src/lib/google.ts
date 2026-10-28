import { Google } from "arctic";

export function googleEnabled() {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET && !!process.env.APP_URL;
}

export function googleClient() {
  return new Google(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    `${process.env.APP_URL!.replace(/\/$/, "")}/api/auth/google/callback`,
  );
}

/** Only allow returning to a table page on this site. */
export function safeNext(next: string | null | undefined): string {
  return next && /^\/t\/[A-Za-z0-9_-]+(\/[a-z]+)?$/.test(next) ? next : "/";
}
