import { z } from "zod";
import { handler, json, readJson } from "@/lib/http";
import { createOtp, devOtpAllowed, normalizeIndianPhone, sendOtpSms, smsConfigured } from "@/lib/auth";
import { DomainError, getTableByToken } from "@/lib/domain";

const body = z.object({
  phone: z.string().max(20),
  // "waiter": the code shows on the waiter's screen and the waiter reads it out.
  via: z.enum(["sms", "waiter"]).default("sms"),
  token: z.string().max(64).optional(),
});

export const POST = handler(async (req, db) => {
  const b = await readJson(req, body);
  const phone = normalizeIndianPhone(b.phone);
  const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  if (b.via === "waiter") {
    const found = b.token ? await getTableByToken(db, b.token) : null;
    if (!found || !found.table.active) throw new DomainError("We couldn't find your table. Please scan the QR code again.", 404);
    await createOtp(db, phone, ip, found.table.id);
    return json({ ok: true });
  }

  if (!smsConfigured() && !devOtpAllowed()) {
    throw new DomainError("SMS codes are not set up yet. Please get your code from the waiter.", 503);
  }
  const code = await createOtp(db, phone, ip);
  if (smsConfigured()) {
    await sendOtpSms(phone, code);
    return json({ ok: true });
  }
  // Development only: no SMS provider, so show the code on screen.
  return json({ ok: true, devCode: code });
});
