import { NextResponse, type NextRequest } from "next/server";
import { decodeIdToken } from "arctic";
import { getDb } from "@/db";
import { GUEST_COOKIE, guestTtlSeconds, signSession, upsertGoogleGuest } from "@/lib/auth";
import { googleClient, googleEnabled, safeNext } from "@/lib/google";
import { cookieOptions } from "@/lib/http";

export async function GET(req: NextRequest) {
  const next = safeNext(req.cookies.get("g_next")?.value);
  const fail = NextResponse.redirect(new URL(`${next}${next.includes("?") ? "&" : "?"}login=failed`, req.url));
  if (!googleEnabled()) return fail;
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const verifier = req.cookies.get("g_verifier")?.value;
  if (!code || !state || !verifier || state !== req.cookies.get("g_state")?.value) return fail;
  try {
    const tokens = await googleClient().validateAuthorizationCode(code, verifier);
    const claims = decodeIdToken(tokens.idToken()) as { sub: string; email?: string; name?: string; email_verified?: boolean };
    const guest = await upsertGoogleGuest(getDb(), { sub: claims.sub, email: claims.email ?? null, name: claims.name ?? "" });
    const res = NextResponse.redirect(new URL(next, req.url));
    res.cookies.set(GUEST_COOKIE, await signSession({ kind: "guest", id: guest.id }, guestTtlSeconds), cookieOptions(guestTtlSeconds));
    for (const c of ["g_state", "g_verifier", "g_next"]) res.cookies.delete(c);
    return res;
  } catch (err) {
    console.error("Google sign-in failed", err);
    return fail;
  }
}
