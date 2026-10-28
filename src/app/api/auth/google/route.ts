import { NextResponse, type NextRequest } from "next/server";
import { generateCodeVerifier, generateState } from "arctic";
import { googleClient, googleEnabled, safeNext } from "@/lib/google";

export async function GET(req: NextRequest) {
  if (!googleEnabled()) return NextResponse.json({ error: "Google sign-in is not set up" }, { status: 503 });
  const state = generateState();
  const verifier = generateCodeVerifier();
  const url = googleClient().createAuthorizationURL(state, verifier, ["openid", "profile", "email"]);
  const res = NextResponse.redirect(url);
  const opts = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 600 };
  res.cookies.set("g_state", state, opts);
  res.cookies.set("g_verifier", verifier, opts);
  res.cookies.set("g_next", safeNext(req.nextUrl.searchParams.get("next")), opts);
  return res;
}
