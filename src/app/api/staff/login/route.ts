import { z } from "zod";
import { NextResponse } from "next/server";
import { handler, readJson, cookieOptions } from "@/lib/http";
import { STAFF_COOKIE, normalizeIndianPhone, signSession, staffLogin, staffTtlSeconds } from "@/lib/auth";

export const POST = handler(async (req, db) => {
  const body = await readJson(req, z.object({ phone: z.string().max(20), pin: z.string().max(6) }));
  const s = await staffLogin(db, normalizeIndianPhone(body.phone), body.pin);
  const res = NextResponse.json({ ok: true, role: s.role, name: s.name });
  res.cookies.set(STAFF_COOKIE, await signSession({ kind: "staff", id: s.id }, staffTtlSeconds), cookieOptions(staffTtlSeconds));
  return res;
});
