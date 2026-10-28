import { z } from "zod";
import { handler, json, readJson } from "@/lib/http";
import { createOtp, devOtpAllowed, normalizeIndianPhone, sendOtpSms, smsConfigured } from "@/lib/auth";
import { DomainError } from "@/lib/domain";

export const POST = handler(async (req, db) => {
  const body = await readJson(req, z.object({ phone: z.string().max(20) }));
  const phone = normalizeIndianPhone(body.phone);
  if (!smsConfigured() && !devOtpAllowed()) {
    throw new DomainError("Mobile login is not set up yet. Please use Google, or ask your waiter.", 503);
  }
  const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const code = await createOtp(db, phone, ip);
  if (smsConfigured()) {
    await sendOtpSms(phone, code);
    return json({ ok: true });
  }
  // Development only: no SMS provider, so show the code on screen.
  return json({ ok: true, devCode: code });
});
