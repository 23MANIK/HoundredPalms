type P<T> = { params: Promise<T> };
import { z } from "zod";
import { NextResponse } from "next/server";
import { cookieOptions, handler, idParam, json, readJson, requireStaff } from "@/lib/http";
import { DomainError, resetStaffPin, setStaffActive } from "@/lib/domain";
import { STAFF_COOKIE, signSession, staffTtlSeconds } from "@/lib/auth";
import { hashPin } from "@/lib/crypto";
import { pinProblem } from "@/lib/pin";

export const PATCH = handler<P<{ id: string }>>(async (req, db, { params }) => {
  const actor = await requireStaff(db, ["manager"]);
  const id = idParam.parse((await params).id);
  const body = await readJson(req, z.union([z.object({ active: z.boolean() }), z.object({ pin: z.string().max(6) })]));
  if ("active" in body) {
    await setStaffActive(db, actor, id, body.active);
    return json({ ok: true });
  }
  const problem = pinProblem(body.pin);
  if (problem) throw new DomainError(problem);
  const v = await resetStaffPin(db, actor, id, await hashPin(body.pin));
  if (id !== actor.id) return json({ ok: true });
  // A manager who changes their own PIN stays signed in on this device only.
  const res = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  res.cookies.set(STAFF_COOKIE, await signSession({ kind: "staff", id, v }, staffTtlSeconds), cookieOptions(staffTtlSeconds));
  return res;
});
