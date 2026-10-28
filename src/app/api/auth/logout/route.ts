import { NextResponse } from "next/server";
import { GUEST_COOKIE, STAFF_COOKIE } from "@/lib/auth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(GUEST_COOKIE);
  res.cookies.delete(STAFF_COOKIE);
  return res;
}
