import { SignJWT, jwtVerify } from "jose";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { guests, otpCodes, staff, auditLog } from "@/db/schema";
import { DomainError, type GuestActor, type StaffActor } from "./domain";
import { newOtp, sha256, verifyPin } from "./crypto";

export const GUEST_COOKIE = "hp_guest";
export const STAFF_COOKIE = "hp_staff";
const GUEST_TTL_DAYS = 30;
const STAFF_TTL_HOURS = 14;

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: { kind: "guest" | "staff"; id: number }, ttlSeconds: number) {
  return new SignJWT({ kind: payload.kind })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(payload.id))
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(secretKey());
}

export async function readSession(token: string | undefined, kind: "guest" | "staff"): Promise<number | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (payload.kind !== kind || !payload.sub) return null;
    const id = Number(payload.sub);
    return Number.isInteger(id) ? id : null;
  } catch {
    return null;
  }
}

export const guestTtlSeconds = GUEST_TTL_DAYS * 24 * 3600;
export const staffTtlSeconds = STAFF_TTL_HOURS * 3600;

export async function loadGuest(db: DB, id: number | null): Promise<GuestActor | null> {
  if (!id) return null;
  const g = await db.query.guests.findFirst({ where: eq(guests.id, id) });
  if (!g) return null;
  return { kind: "guest", id: g.id, name: g.name || g.phone || g.email || "Guest" };
}

export async function loadStaff(db: DB, id: number | null): Promise<StaffActor | null> {
  if (!id) return null;
  const s = await db.query.staff.findFirst({ where: eq(staff.id, id) });
  if (!s || !s.active) return null;
  return { kind: "staff", id: s.id, name: s.name, role: s.role };
}

// ---------- Phone numbers ----------

/** Accepts Indian mobile numbers with or without +91 / 0, returns +91XXXXXXXXXX. */
export function normalizeIndianPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const ten = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits.length === 11 && digits.startsWith("0") ? digits.slice(1) : digits;
  if (!/^[6-9]\d{9}$/.test(ten)) throw new DomainError("Enter a valid 10-digit Indian mobile number");
  return `+91${ten}`;
}

// ---------- Guest OTP ----------

const OTP_TTL_MS = 5 * 60_000;
const OTP_MAX_PER_WINDOW = 3;
const OTP_WINDOW_MS = 10 * 60_000;
const OTP_MAX_ATTEMPTS = 5;

function otpHash(phone: string, code: string) {
  return sha256(`${phone}:${code}:${process.env.SESSION_SECRET ?? ""}`);
}

const OTP_MAX_PER_IP_HOUR = 10;

export async function createOtp(db: DB, phone: string, ip: string | null = null): Promise<string> {
  if (ip) {
    // Stops one device from sending SMS to many numbers (each SMS costs money).
    const hourAgo = new Date(Date.now() - 3600_000);
    const fromIp = await db.query.otpCodes.findMany({ where: and(eq(otpCodes.ip, ip), gte(otpCodes.createdAt, hourAgo)), columns: { id: true } });
    if (fromIp.length >= OTP_MAX_PER_IP_HOUR) throw new DomainError("Too many codes requested from this device. Please ask your waiter.", 429);
  }
  const since = new Date(Date.now() - OTP_WINDOW_MS);
  const recent = await db.query.otpCodes.findMany({
    where: and(eq(otpCodes.phone, phone), gte(otpCodes.createdAt, since)),
  });
  if (recent.length >= OTP_MAX_PER_WINDOW) {
    throw new DomainError("Too many codes requested. Please wait 10 minutes and try again.", 429);
  }
  const code = newOtp();
  await db.insert(otpCodes).values({ phone, ip, codeHash: otpHash(phone, code), expiresAt: new Date(Date.now() + OTP_TTL_MS) });
  return code;
}

export async function verifyOtp(db: DB, phone: string, code: string): Promise<GuestActor> {
  const latest = await db.query.otpCodes.findFirst({
    where: and(eq(otpCodes.phone, phone), isNull(otpCodes.usedAt)),
    orderBy: desc(otpCodes.createdAt),
  });
  if (!latest || latest.expiresAt < new Date()) throw new DomainError("This code has expired. Ask for a new one.");
  if (latest.attempts >= OTP_MAX_ATTEMPTS) throw new DomainError("Too many wrong tries. Ask for a new code.", 429);
  if (latest.codeHash !== otpHash(phone, code.trim())) {
    // Count the wrong try outside any transaction so it is never rolled back.
    await db
      .update(otpCodes)
      .set({ attempts: sql`${otpCodes.attempts} + 1` })
      .where(eq(otpCodes.id, latest.id));
    throw new DomainError("That code is not right. Please check and try again.");
  }
  return db.transaction(async (tx) => {
    // Mark used only if still unused, so the same code can't log in twice in parallel.
    const used = await tx
      .update(otpCodes)
      .set({ usedAt: new Date() })
      .where(and(eq(otpCodes.id, latest.id), isNull(otpCodes.usedAt)))
      .returning({ id: otpCodes.id });
    if (used.length === 0) throw new DomainError("This code has already been used. Ask for a new one.");
    let g = await tx.query.guests.findFirst({ where: eq(guests.phone, phone) });
    if (!g) [g] = await tx.insert(guests).values({ phone }).returning();
    await tx.insert(auditLog).values({ actorType: "guest", actorId: g.id, actorName: phone, action: "guest.login_phone" });
    return { kind: "guest" as const, id: g.id, name: g.name || phone };
  });
}

export async function upsertGoogleGuest(db: DB, profile: { sub: string; email: string | null; name: string }): Promise<GuestActor> {
  return db.transaction(async (tx) => {
    let g = await tx.query.guests.findFirst({ where: eq(guests.googleSub, profile.sub) });
    if (!g) [g] = await tx.insert(guests).values({ googleSub: profile.sub, email: profile.email, name: profile.name }).returning();
    else if (profile.name && g.name !== profile.name) await tx.update(guests).set({ name: profile.name, email: profile.email }).where(eq(guests.id, g.id));
    await tx.insert(auditLog).values({ actorType: "guest", actorId: g.id, actorName: profile.name || profile.email || "Guest", action: "guest.login_google" });
    return { kind: "guest", id: g.id, name: profile.name || g.name || profile.email || "Guest" };
  });
}

export async function setGuestName(db: DB, guestId: number, name: string) {
  const clean = name.trim().slice(0, 60);
  if (!clean) throw new DomainError("Please enter your name");
  await db.update(guests).set({ name: clean }).where(eq(guests.id, guestId));
}

// ---------- SMS ----------

/**
 * Shows the OTP on screen instead of sending an SMS. Only for local development
 * and Vercel preview links, never on the live site.
 */
export function devOtpAllowed() {
  if (process.env.DEV_SHOW_OTP !== "1") return false;
  if (process.env.VERCEL_ENV === "production") return false;
  return process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV === "preview";
}

export function smsConfigured() {
  return process.env.SMS_PROVIDER === "twilio" && !!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_AUTH_TOKEN && !!process.env.TWILIO_FROM;
}

export async function sendOtpSms(phone: string, code: string) {
  if (!smsConfigured()) throw new DomainError("Mobile login is not set up yet. Please use Google, or ask your waiter.", 503);
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: phone, From: process.env.TWILIO_FROM!, Body: `${code} is your Hundred Palms login code. It expires in 5 minutes.` }),
  });
  if (!res.ok) throw new DomainError("We couldn't send the SMS. Please try again.", 502);
}

// ---------- Staff login ----------

const STAFF_MAX_FAILS = 5;
const STAFF_LOCK_MS = 15 * 60_000;

export async function staffLogin(db: DB, phone: string, pin: string): Promise<StaffActor> {
  const s = await db.query.staff.findFirst({ where: eq(staff.phone, phone) });
  const generic = new DomainError("Mobile number or PIN is wrong", 401);
  if (!s || !s.active) throw generic;
  if (s.lockedUntil && s.lockedUntil > new Date()) {
    throw new DomainError("Too many wrong PINs. Try again in 15 minutes or ask the manager.", 429);
  }
  const ok = await verifyPin(pin, s.pinHash);
  if (!ok) {
    const fails = s.failedLogins + 1;
    await db
      .update(staff)
      .set({ failedLogins: fails >= STAFF_MAX_FAILS ? 0 : fails, lockedUntil: fails >= STAFF_MAX_FAILS ? new Date(Date.now() + STAFF_LOCK_MS) : null })
      .where(eq(staff.id, s.id));
    throw generic;
  }
  await db.update(staff).set({ failedLogins: 0, lockedUntil: null }).where(eq(staff.id, s.id));
  await db.insert(auditLog).values({ actorType: "staff", actorId: s.id, actorName: s.name, action: "staff.login" });
  return { kind: "staff", id: s.id, name: s.name, role: s.role };
}

export function isValidPin(pin: string) {
  return /^\d{4,6}$/.test(pin);
}
