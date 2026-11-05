import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb } from "@/db";
import { auditLog, diningTables } from "@/db/schema";
import { getTableByToken, listTablesWithTabs, placeOrder, regenerateTableQr, updateTable } from "@/lib/domain";
import { newQrToken } from "@/lib/crypto";
import { fixture } from "./helpers";

let f: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => {
  f = await fixture();
});
afterAll(async () => {
  await closeDb();
});

describe("Tables & QR list", () => {
  it("lists every active table with seats, status and, for managers, its QR link", async () => {
    await placeOrder(f.db, f.priya, { tableId: f.table.id, lines: [{ menuItemId: f.paneer.id, qty: 1 }] });
    const rows = await listTablesWithTabs(f.db, { includeQr: true });
    expect(rows.map((r) => r.number)).toEqual([1, 7]);
    const free = rows.find((r) => r.id === f.vegTable.id)!;
    expect(free).toMatchObject({ seats: 4, tab: null, qrPath: `/t/${f.vegTable.qrToken}`, restaurant: { id: f.veg.id, name: "Veg" } });
    const busy = rows.find((r) => r.id === f.table.id)!;
    expect(busy.tab).toMatchObject({ billRequested: false });
  });

  it("keeps QR links out of the list for other staff", async () => {
    const rows = await listTablesWithTabs(f.db);
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r).not.toHaveProperty("qrPath");
  });

  it("leaves removed tables out", async () => {
    await updateTable(f.db, f.manager, f.vegTable.id, { active: false });
    const rows = await listTablesWithTabs(f.db, { includeQr: true });
    expect(rows.map((r) => r.id)).toEqual([f.table.id]);
  });
});

describe("new QR code for a table", () => {
  it("swaps the code, retires the old link and logs who did it", async () => {
    const old = f.vegTable.qrToken;
    const fresh = newQrToken();
    await regenerateTableQr(f.db, f.manager, f.vegTable.id, fresh);
    expect(await getTableByToken(f.db, old)).toBeNull();
    expect((await getTableByToken(f.db, fresh))?.table.id).toBe(f.vegTable.id);
    const log = await f.db.select().from(auditLog).where(eq(auditLog.action, "table.qr_regenerated"));
    expect(log).toHaveLength(1);
  });

  it("is refused while the table has an open bill", async () => {
    await placeOrder(f.db, f.priya, { tableId: f.table.id, lines: [{ menuItemId: f.dal.id, qty: 1 }] });
    await expect(regenerateTableQr(f.db, f.manager, f.table.id, newQrToken())).rejects.toThrow(/open bill/);
    const [row] = await f.db.select().from(diningTables).where(eq(diningTables.id, f.table.id));
    expect(row.qrToken).toBe(f.table.qrToken);
  });

  it("is managers only", async () => {
    await expect(regenerateTableQr(f.db, f.waiter, f.vegTable.id, newQrToken())).rejects.toThrow();
    await expect(regenerateTableQr(f.db, f.cashier, f.vegTable.id, newQrToken())).rejects.toThrow();
  });
});
