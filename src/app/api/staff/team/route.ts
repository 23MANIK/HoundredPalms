import { z } from "zod";
import { asc } from "drizzle-orm";
import { handler, json, readJson, requireStaff } from "@/lib/http";
import { addStaff, DomainError } from "@/lib/domain";
import { hashPin } from "@/lib/crypto";
import { normalizeIndianPhone } from "@/lib/auth";
import { pinProblem } from "@/lib/pin";
import { staff } from "@/db/schema";

export const GET = handler(async (_req, db) => {
  await requireStaff(db, ["manager"]);
  const rows = await db
    .select({ id: staff.id, name: staff.name, phone: staff.phone, role: staff.role, active: staff.active })
    .from(staff)
    .orderBy(asc(staff.name));
  return json({ staff: rows });
});

export const POST = handler(async (req, db) => {
  const actor = await requireStaff(db, ["manager"]);
  const b = await readJson(req, z.object({ name: z.string().max(60), phone: z.string().max(20), role: z.enum(["waiter", "kitchen", "cashier", "manager"]), pin: z.string().max(6) }));
  const problem = pinProblem(b.pin);
  if (problem) throw new DomainError(problem);
  const id = await addStaff(db, actor, { name: b.name, phone: normalizeIndianPhone(b.phone), role: b.role, pinHash: await hashPin(b.pin) });
  return json({ id }, 201);
});
