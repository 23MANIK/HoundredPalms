import { z } from "zod";
import { NextResponse } from "next/server";
import { handler, readJson, cookieOptions } from "@/lib/http";
import { GUEST_COOKIE, guestTtlSeconds, normalizeIndianPhone, signSession, verifyOtp } from "@/lib/auth";

export const POST = handler(async (req, db) => {
  const body = await readJson(req, z.object({ phone: z.string().max(20), code: z.string().regex(/^\d{6}$/) }));
  const guest = await verifyOtp(db, normalizeIndianPhone(body.phone), body.code);
  const res = NextResponse.json({ ok: true, guest: { id: guest.id, name: guest.name } });
  res.cookies.set(GUEST_COOKIE, await signSession({ kind: "guest", id: guest.id }, guestTtlSeconds), cookieOptions(guestTtlSeconds));
  return res;
});
