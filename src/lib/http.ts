import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getDb, type DB } from "@/db";
import { DomainError, type GuestActor, type StaffActor, type StaffRole } from "./domain";
import { GUEST_COOKIE, STAFF_COOKIE, loadGuest, loadStaff, readSession } from "./auth";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function errorResponse(err: unknown) {
  if (err instanceof DomainError) return json({ error: err.message }, err.status);
  if (err instanceof z.ZodError) return json({ error: "Some details are missing or not valid" }, 400);
  console.error(err);
  return json({ error: "Something went wrong. Please try again." }, 500);
}

/**
 * Blocks cross-site form posts: every write must be JSON, and when the browser
 * sends an Origin header it must match this site.
 */
function assertSameOrigin(req: NextRequest) {
  const type = req.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) throw new DomainError("Unsupported request", 415);
  const origin = req.headers.get("origin");
  if (origin) {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (!host || new URL(origin).host !== host) throw new DomainError("Unsupported request", 403);
  }
}

export async function readJson<T extends z.ZodTypeAny>(req: NextRequest, schema: T): Promise<z.infer<T>> {
  assertSameOrigin(req);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new DomainError("Unsupported request", 400);
  }
  return schema.parse(body);
}

export async function currentGuest(db: DB): Promise<GuestActor | null> {
  const store = await cookies();
  return loadGuest(db, await readSession(store.get(GUEST_COOKIE)?.value, "guest"));
}

export async function currentStaff(db: DB): Promise<StaffActor | null> {
  const store = await cookies();
  return loadStaff(db, await readSession(store.get(STAFF_COOKIE)?.value, "staff"));
}

export async function requireGuest(db: DB): Promise<GuestActor> {
  const g = await currentGuest(db);
  if (!g) throw new DomainError("Please sign in first", 401);
  return g;
}

export async function requireStaff(db: DB, roles?: StaffRole[]): Promise<StaffActor> {
  const s = await currentStaff(db);
  if (!s) throw new DomainError("Please sign in", 401);
  if (roles && !roles.includes(s.role)) throw new DomainError("You don't have permission to do that", 403);
  return s;
}

export const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge,
});

/** Wraps a route handler with the database and uniform error handling. */
export function handler<Ctx>(fn: (req: NextRequest, db: DB, ctx: Ctx) => Promise<Response>) {
  return async (req: NextRequest, ctx: Ctx) => {
    try {
      return await fn(req, getDb(), ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export const idParam = z.coerce.number().int().positive();
