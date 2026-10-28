import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb } from "@/db";
import { auditLog, orders, tabs } from "@/db/schema";
import {
  advanceKitchen,
  approveOrder,
  cancelOrder,
  closeTab,
  getTabDetail,
  guestAcceptRemoval,
  markServed,
  placeOrder,
  requestBill,
  setItemUnavailable,
  setMenuItemStock,
} from "@/lib/domain";
import { fixture } from "./helpers";

let f: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => {
  f = await fixture();
});
afterAll(async () => {
  await closeDb();
});

describe("placing orders", () => {
  it("a guest order waits for a waiter and opens one tab per table", async () => {
    const o1 = await placeOrder(f.db, f.priya, { tableId: f.table.id, lines: [{ menuItemId: f.paneer.id, qty: 1 }] });
    const o2 = await placeOrder(f.db, f.amit, { tableId: f.table.id, lines: [{ menuItemId: f.dal.id, qty: 2 }] });
    expect(o1.status).toBe("pending");
    expect(o1.tabId).toBe(o2.tabId);
    const open = await f.db.select().from(tabs).where(eq(tabs.tableId, f.table.id));
    expect(open).toHaveLength(1);
  });

  it("parallel orders at one table still share one tab", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => placeOrder(f.db, f.priya, { tableId: f.table.id, lines: [{ menuItemId: f.dal.id, qty: 1 }] })),
    );
    expect(new Set(results.map((r) => r.tabId)).size).toBe(1);
  });

  it("a waiter order is approved straight away", async () => {
    const o = await placeOrder(f.db, f.waiter, { tableId: f.table.id, lines: [{ menuItemId: f.dal.id, qty: 1 }] });
    expect(o.status).toBe("approved");
    expect(o.approvedByStaffId).toBe(f.waiter.id);
  });

  it("rejects non-veg in the veg restaurant, sold-out dishes and bad quantities", async () => {
    await expect(placeOrder(f.db, f.priya, { tableId: f.vegTable.id, lines: [{ menuItemId: f.chicken.id, qty: 1 }] })).rejects.toThrow(/isn't served/);
    await setMenuItemStock(f.db, f.manager, f.dal.id, false);
    await expect(placeOrder(f.db, f.priya, { tableId: f.table.id, lines: [{ menuItemId: f.dal.id, qty: 1 }] })).rejects.toThrow(/sold out/);
    await expect(placeOrder(f.db, f.priya, { tableId: f.table.id, lines: [{ menuItemId: f.paneer.id, qty: 0 }] })).rejects.toThrow(/Quantity/);
    await expect(placeOrder(f.db, f.priya, { tableId: f.table.id, lines: [] })).rejects.toThrow(/empty/);
  });

  it("copies name and price so menu edits don't change the bill", async () => {
    const o = await placeOrder(f.db, f.priya, { tableId: f.table.id, lines: [{ menuItemId: f.paneer.id, qty: 2 }] });
    const d = await getTabDetail(f.db, o.tabId);
    expect(d.orders[0].items[0]).toMatchObject({ name: "Paneer", pricePaise: 29000, qty: 2 });
  });
});

describe("waiter approval", () => {
  it("approves a clean order, and the kitchen takes it to served", async () => {
    const o = await placeOrder(f.db, f.priya, { tableId: f.table.id, lines: [{ menuItemId: f.paneer.id, qty: 1 }] });
    expect(await approveOrder(f.db, f.waiter, o.id)).toBe("approved");
    expect(await advanceKitchen(f.db, f.kitchen, o.id)).toBe("preparing");
    expect(await advanceKitchen(f.db, f.kitchen, o.id)).toBe("ready");
    await markServed(f.db, f.waiter, o.id);
    const [row] = await f.db.select().from(orders).where(eq(orders.id, o.id));
    expect(row.status).toBe("served");
  });

  it("kitchen never sees unapproved orders move", async () => {
    const o = await placeOrder(f.db, f.priya, { tableId: f.table.id, lines: [{ menuItemId: f.paneer.id, qty: 1 }] });
    await expect(advanceKitchen(f.db, f.kitchen, o.id)).rejects.toThrow();
  });

  it("an unavailable item sends the order back; the guest drops it; the waiter approves the rest", async () => {
    const o = await placeOrder(f.db, f.priya, {
      tableId: f.table.id,
      lines: [{ menuItemId: f.paneer.id, qty: 1 }, { menuItemId: f.dal.id, qty: 1 }],
    });
    const d = await getTabDetail(f.db, o.tabId);
    const dalItem = d.orders[0].items.find((i) => i.name === "Dal")!;
    await setItemUnavailable(f.db, f.waiter, dalItem.id, true);
    expect(await approveOrder(f.db, f.waiter, o.id)).toBe("returned");
    await expect(guestAcceptRemoval(f.db, f.amit, o.id)).rejects.toThrow(/not found/);
    expect(await guestAcceptRemoval(f.db, f.priya, o.id)).toBe("pending");
    expect(await approveOrder(f.db, f.waiter, o.id)).toBe("approved");
    const after = await getTabDetail(f.db, o.tabId);
    expect(after.bill.subtotalPaise).toBe(29000);
  });

  it("if every item is unavailable the order is cancelled, not billed", async () => {
    const o = await placeOrder(f.db, f.priya, { tableId: f.table.id, lines: [{ menuItemId: f.dal.id, qty: 1 }] });
    const d = await getTabDetail(f.db, o.tabId);
    await setItemUnavailable(f.db, f.waiter, d.orders[0].items[0].id, true);
    await approveOrder(f.db, f.waiter, o.id);
    expect(await guestAcceptRemoval(f.db, f.priya, o.id)).toBe("cancelled");
  });

  it("only waiters and managers can approve or cancel", async () => {
    const o = await placeOrder(f.db, f.priya, { tableId: f.table.id, lines: [{ menuItemId: f.paneer.id, qty: 1 }] });
    await expect(approveOrder(f.db, f.kitchen, o.id)).rejects.toThrow(/permission/);
    await expect(cancelOrder(f.db, f.cashier, o.id, "x")).rejects.toThrow(/permission/);
  });

  it("cancelling needs a reason, is logged, and removes the order from the bill", async () => {
    const o = await placeOrder(f.db, f.priya, { tableId: f.table.id, lines: [{ menuItemId: f.paneer.id, qty: 1 }] });
    await approveOrder(f.db, f.waiter, o.id);
    await expect(cancelOrder(f.db, f.waiter, o.id, "  ")).rejects.toThrow(/reason/);
    await cancelOrder(f.db, f.waiter, o.id, "Guest changed mind");
    const d = await getTabDetail(f.db, o.tabId);
    expect(d.bill.subtotalPaise).toBe(0);
    expect(d.orders[0].cancelledBy).toBe("Ramesh");
    const log = await f.db.select().from(auditLog).where(eq(auditLog.orderId, o.id));
    expect(log.map((l) => l.action)).toEqual(["order.placed", "order.approved", "order.cancelled"]);
    expect(log[2].actorName).toBe("Ramesh");
  });

  it("only a manager can cancel a served order", async () => {
    const o = await placeOrder(f.db, f.waiter, { tableId: f.table.id, lines: [{ menuItemId: f.paneer.id, qty: 1 }] });
    await markServed(f.db, f.waiter, o.id);
    await expect(cancelOrder(f.db, f.waiter, o.id, "wrong")).rejects.toThrow(/manager/);
    await cancelOrder(f.db, f.manager, o.id, "wrong table");
  });
});

describe("bills", () => {
  it("closes a tab with 5% GST, records who and how, and the next order opens a new tab", async () => {
    const o = await placeOrder(f.db, f.priya, { tableId: f.table.id, lines: [{ menuItemId: f.paneer.id, qty: 2 }] });
    await approveOrder(f.db, f.waiter, o.id);
    await requestBill(f.db, f.priya, f.table.id);
    const bill = await closeTab(f.db, f.cashier, o.tabId, { discountPct: 10, paymentMethod: "upi" });
    expect(bill.subtotalPaise).toBe(58000);
    expect(bill.taxablePaise).toBe(52200);
    expect(bill.totalPaise).toBe(54810);
    const [tab] = await f.db.select().from(tabs).where(eq(tabs.id, o.tabId));
    expect(tab).toMatchObject({ status: "paid", paymentMethod: "upi", closedByStaffId: f.cashier.id, totalPaise: 54810 });
    await expect(closeTab(f.db, f.cashier, o.tabId, { discountPct: 0, paymentMethod: "cash" })).rejects.toThrow(/already closed/);
    const next = await placeOrder(f.db, f.amit, { tableId: f.table.id, lines: [{ menuItemId: f.dal.id, qty: 1 }] });
    expect(next.tabId).not.toBe(o.tabId);
  });

  it("can't close while an order still waits for the waiter", async () => {
    const o = await placeOrder(f.db, f.priya, { tableId: f.table.id, lines: [{ menuItemId: f.paneer.id, qty: 1 }] });
    await expect(closeTab(f.db, f.cashier, o.tabId, { discountPct: 0, paymentMethod: "cash" })).rejects.toThrow(/need a waiter/);
  });

  it("caps cashier discount at 20%, managers can go higher", async () => {
    const o = await placeOrder(f.db, f.waiter, { tableId: f.table.id, lines: [{ menuItemId: f.paneer.id, qty: 1 }] });
    await expect(closeTab(f.db, f.cashier, o.tabId, { discountPct: 25, paymentMethod: "cash" })).rejects.toThrow(/20%/);
    await closeTab(f.db, f.manager, o.tabId, { discountPct: 25, paymentMethod: "cash" });
  });

  it("waiters can't take payment, and only guests who ordered can ask for the bill", async () => {
    const o = await placeOrder(f.db, f.priya, { tableId: f.table.id, lines: [{ menuItemId: f.paneer.id, qty: 1 }] });
    await expect(closeTab(f.db, f.waiter, o.tabId, { discountPct: 0, paymentMethod: "cash" })).rejects.toThrow(/permission/);
    await expect(requestBill(f.db, f.amit, f.table.id)).rejects.toThrow(/Only guests/);
  });
});
