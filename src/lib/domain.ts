import { and, asc, desc, eq, inArray, gte, sql } from "drizzle-orm";
import type { DB } from "@/db";
import {
  auditLog,
  diningTables,
  guests,
  menuCategories,
  menuItems,
  orderItems,
  orders,
  restaurants,
  settings,
  staff,
  tabs,
} from "@/db/schema";
import { computeBill } from "./money";

export class DomainError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export type StaffRole = "waiter" | "kitchen" | "cashier" | "manager";
export type StaffActor = { kind: "staff"; id: number; name: string; role: StaffRole };
export type GuestActor = { kind: "guest"; id: number; name: string };
export type Actor = StaffActor | GuestActor;

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
type Conn = DB | Tx;

export const MAX_QTY_PER_LINE = 20;
export const MAX_LINES_PER_ORDER = 30;
export const DEFAULT_GST_BP = 500;
export const CASHIER_MAX_DISCOUNT = 20;

function requireRole(actor: StaffActor, roles: StaffRole[]) {
  if (!roles.includes(actor.role)) {
    throw new DomainError("You don't have permission to do that", 403);
  }
}

async function audit(
  conn: Conn,
  actor: Actor | { kind: "system"; name: string },
  action: string,
  refs: { tableId?: number; tabId?: number; orderId?: number },
  details: Record<string, unknown> = {},
) {
  await conn.insert(auditLog).values({
    actorType: actor.kind,
    actorId: "id" in actor ? actor.id : null,
    actorName: actor.name,
    action,
    tableId: refs.tableId ?? null,
    tabId: refs.tabId ?? null,
    orderId: refs.orderId ?? null,
    details,
  });
}

// ---------- Settings ----------

export async function getGstRateBp(conn: Conn): Promise<number> {
  const row = await conn.query.settings.findFirst({ where: eq(settings.key, "gst_rate_bp") });
  const n = row ? Number(row.value) : DEFAULT_GST_BP;
  return Number.isInteger(n) ? n : DEFAULT_GST_BP;
}

export async function setGstRateBp(db: DB, actor: StaffActor, bp: number) {
  requireRole(actor, ["manager"]);
  if (!Number.isInteger(bp) || bp < 0 || bp > 2800) throw new DomainError("GST must be between 0% and 28%");
  await db.transaction(async (tx) => {
    await tx
      .insert(settings)
      .values({ key: "gst_rate_bp", value: String(bp) })
      .onConflictDoUpdate({ target: settings.key, set: { value: String(bp) } });
    await audit(tx, actor, "settings.gst", {}, { gstRateBp: bp });
  });
}

// ---------- Tables and menu ----------

export async function getTableByToken(db: DB, token: string) {
  const rows = await db
    .select({ table: diningTables, restaurant: restaurants })
    .from(diningTables)
    .innerJoin(restaurants, eq(restaurants.id, diningTables.restaurantId))
    .where(and(eq(diningTables.qrToken, token), eq(diningTables.active, true)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getMenu(db: DB, opts: { vegOnly: boolean }) {
  const cats = await db.select().from(menuCategories).orderBy(asc(menuCategories.sort), asc(menuCategories.id));
  const items = await db
    .select()
    .from(menuItems)
    .where(eq(menuItems.archived, false))
    .orderBy(asc(menuItems.sort), asc(menuItems.id));
  return cats
    .map((c) => ({
      id: c.id,
      name: c.name,
      items: items
        .filter((i) => i.categoryId === c.id && (!opts.vegOnly || i.isVeg))
        .map((i) => ({
          id: i.id,
          name: i.name,
          description: i.description,
          pricePaise: i.pricePaise,
          isVeg: i.isVeg,
          isBestseller: i.isBestseller,
          imageUrl: i.imageUrl,
          inStock: i.inStock,
        })),
    }))
    .filter((c) => c.items.length > 0);
}

// ---------- Placing orders ----------

export type OrderLineInput = { menuItemId: number; qty: number };

async function openTabFor(tx: Tx, tableId: number) {
  // Lock the table row so two phones ordering at once share one tab.
  await tx.execute(sql`select id from dining_tables where id = ${tableId} for update`);
  const existing = await tx.query.tabs.findFirst({
    where: and(eq(tabs.tableId, tableId), eq(tabs.status, "open")),
  });
  if (existing) return { tab: existing, created: false };
  const [tab] = await tx.insert(tabs).values({ tableId }).returning();
  return { tab, created: true };
}

export async function placeOrder(
  db: DB,
  actor: Actor,
  input: { tableId: number; lines: OrderLineInput[]; note?: string },
) {
  if (actor.kind === "staff") requireRole(actor, ["waiter", "manager"]);
  const lines = mergeLines(input.lines);
  if (lines.length === 0) throw new DomainError("Your cart is empty");
  if (lines.length > MAX_LINES_PER_ORDER) throw new DomainError("Too many different dishes in one order");
  for (const l of lines) {
    if (!Number.isInteger(l.qty) || l.qty < 1 || l.qty > MAX_QTY_PER_LINE) {
      throw new DomainError(`Quantity must be between 1 and ${MAX_QTY_PER_LINE}`);
    }
  }
  const note = (input.note ?? "").trim().slice(0, 300);

  return db.transaction(async (tx) => {
    const tableRow = await tx
      .select({ table: diningTables, restaurant: restaurants })
      .from(diningTables)
      .innerJoin(restaurants, eq(restaurants.id, diningTables.restaurantId))
      .where(eq(diningTables.id, input.tableId))
      .limit(1);
    const found = tableRow[0];
    if (!found || !found.table.active) throw new DomainError("This table is not taking orders", 404);

    const menu = await tx
      .select()
      .from(menuItems)
      .where(inArray(menuItems.id, lines.map((l) => l.menuItemId)));
    const byId = new Map(menu.map((m) => [m.id, m]));
    for (const l of lines) {
      const m = byId.get(l.menuItemId);
      if (!m || m.archived) throw new DomainError("A dish in your cart is no longer on the menu");
      if (!m.inStock) throw new DomainError(`${m.name} is sold out right now`);
      if (found.restaurant.vegOnly && !m.isVeg) throw new DomainError(`${m.name} isn't served in this restaurant`);
    }

    const { tab, created } = await openTabFor(tx, input.tableId);
    if (tab.billRequestedAt) {
      // A new order after asking for the bill reopens the bill.
      await tx.update(tabs).set({ billRequestedAt: null }).where(eq(tabs.id, tab.id));
    }
    const byStaff = actor.kind === "staff";
    const now = new Date();
    const [order] = await tx
      .insert(orders)
      .values({
        tabId: tab.id,
        tableId: input.tableId,
        guestId: byStaff ? null : actor.id,
        placedByStaffId: byStaff ? actor.id : null,
        // A waiter taking the order in person is the approval.
        status: byStaff ? "approved" : "pending",
        approvedByStaffId: byStaff ? actor.id : null,
        approvedAt: byStaff ? now : null,
        note,
      })
      .returning();
    await tx.insert(orderItems).values(
      lines.map((l) => {
        const m = byId.get(l.menuItemId)!;
        return {
          orderId: order.id,
          menuItemId: m.id,
          name: m.name,
          pricePaise: m.pricePaise,
          isVeg: m.isVeg,
          qty: l.qty,
        };
      }),
    );
    if (created) await audit(tx, actor, "tab.opened", { tableId: input.tableId, tabId: tab.id });
    await audit(
      tx,
      actor,
      byStaff ? "order.placed_by_staff" : "order.placed",
      { tableId: input.tableId, tabId: tab.id, orderId: order.id },
      { items: lines.map((l) => ({ name: byId.get(l.menuItemId)!.name, qty: l.qty })), note },
    );
    return order;
  });
}

function mergeLines(lines: OrderLineInput[]): OrderLineInput[] {
  const map = new Map<number, number>();
  for (const l of lines) {
    if (!Number.isInteger(l.menuItemId)) throw new DomainError("Invalid dish");
    map.set(l.menuItemId, (map.get(l.menuItemId) ?? 0) + l.qty);
  }
  return [...map.entries()].map(([menuItemId, qty]) => ({ menuItemId, qty }));
}

// ---------- Order state changes ----------

async function lockOrder(tx: Tx, orderId: number) {
  await tx.execute(sql`select id from orders where id = ${orderId} for update`);
  const order = await tx.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!order) throw new DomainError("Order not found", 404);
  return order;
}

async function touch(tx: Tx, orderId: number, patch: Partial<typeof orders.$inferInsert>) {
  await tx
    .update(orders)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(orders.id, orderId));
}

export async function setItemUnavailable(db: DB, actor: StaffActor, orderItemId: number, unavailable: boolean) {
  requireRole(actor, ["waiter", "manager"]);
  return db.transaction(async (tx) => {
    const item = await tx.query.orderItems.findFirst({ where: eq(orderItems.id, orderItemId) });
    if (!item) throw new DomainError("Item not found", 404);
    const order = await lockOrder(tx, item.orderId);
    if (order.status !== "pending") throw new DomainError("Items can only be changed before the order is approved");
    if (item.status === "removed") throw new DomainError("The guest already removed this item");
    await tx
      .update(orderItems)
      .set({ status: unavailable ? "unavailable" : "active" })
      .where(eq(orderItems.id, orderItemId));
    await audit(
      tx,
      actor,
      unavailable ? "item.marked_unavailable" : "item.marked_available",
      { tableId: order.tableId, tabId: order.tabId, orderId: order.id },
      { item: item.name, qty: item.qty },
    );
  });
}

export async function approveOrder(db: DB, actor: StaffActor, orderId: number) {
  requireRole(actor, ["waiter", "manager"]);
  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.status !== "pending") throw new DomainError("This order is not waiting for approval");
    const items = await tx.query.orderItems.findMany({ where: eq(orderItems.orderId, orderId) });
    const flagged = items.filter((i) => i.status === "unavailable");
    const next = flagged.length > 0 ? "returned" : "approved";
    await touch(tx, orderId, next === "approved" ? { status: next, approvedByStaffId: actor.id, approvedAt: new Date() } : { status: next });
    await audit(
      tx,
      actor,
      next === "approved" ? "order.approved" : "order.returned_to_guest",
      { tableId: order.tableId, tabId: order.tabId, orderId },
      next === "returned" ? { unavailable: flagged.map((i) => i.name) } : {},
    );
    return next;
  });
}

/** Guest accepts that flagged items are dropped. The rest goes back to the waiter. */
export async function guestAcceptRemoval(db: DB, actor: GuestActor, orderId: number) {
  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.guestId !== actor.id) throw new DomainError("Order not found", 404);
    if (order.status !== "returned") throw new DomainError("Nothing to confirm on this order");
    await tx
      .update(orderItems)
      .set({ status: "removed" })
      .where(and(eq(orderItems.orderId, orderId), eq(orderItems.status, "unavailable")));
    const remaining = await tx.query.orderItems.findMany({
      where: and(eq(orderItems.orderId, orderId), eq(orderItems.status, "active")),
    });
    const next = remaining.length > 0 ? "pending" : "cancelled";
    await touch(tx, orderId, next === "cancelled" ? { status: next, cancelReason: "All items were unavailable" } : { status: next });
    await audit(tx, actor, "order.guest_removed_unavailable", {
      tableId: order.tableId,
      tabId: order.tabId,
      orderId,
    });
    if (next === "cancelled") {
      await audit(tx, { kind: "system", name: "System" }, "order.cancelled", { tableId: order.tableId, tabId: order.tabId, orderId }, { reason: "All items were unavailable" });
    }
    return next;
  });
}

const KITCHEN_NEXT: Record<string, "preparing" | "ready" | undefined> = {
  approved: "preparing",
  preparing: "ready",
};

export async function advanceKitchen(db: DB, actor: StaffActor, orderId: number) {
  requireRole(actor, ["kitchen", "manager"]);
  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    const next = KITCHEN_NEXT[order.status];
    if (!next) throw new DomainError("The kitchen can't move this order on");
    await touch(tx, orderId, { status: next });
    await audit(tx, actor, `order.${next}`, { tableId: order.tableId, tabId: order.tabId, orderId });
    return next;
  });
}

export async function markServed(db: DB, actor: StaffActor, orderId: number) {
  requireRole(actor, ["waiter", "manager"]);
  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (!["approved", "preparing", "ready"].includes(order.status)) {
      throw new DomainError("Only approved orders can be marked served");
    }
    await touch(tx, orderId, { status: "served" });
    await audit(tx, actor, "order.served", { tableId: order.tableId, tabId: order.tabId, orderId });
  });
}

/** Only staff can cancel. Guests ask the waiter, who cancels on their behalf. */
export async function cancelOrder(db: DB, actor: StaffActor, orderId: number, reason: string) {
  requireRole(actor, ["waiter", "manager"]);
  const why = reason.trim().slice(0, 200);
  if (!why) throw new DomainError("Please give a reason for cancelling");
  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.status === "cancelled") throw new DomainError("This order is already cancelled");
    if (order.status === "served" && actor.role !== "manager") {
      throw new DomainError("Served orders can only be cancelled by a manager");
    }
    const tab = await tx.query.tabs.findFirst({ where: eq(tabs.id, order.tabId) });
    if (tab?.status === "paid") throw new DomainError("This bill is already paid");
    await touch(tx, orderId, { status: "cancelled", cancelledByStaffId: actor.id, cancelReason: why });
    await audit(tx, actor, "order.cancelled", { tableId: order.tableId, tabId: order.tabId, orderId }, { reason: why, previousStatus: order.status });
  });
}

// ---------- Bills ----------

const BILLABLE = ["approved", "preparing", "ready", "served"] as const;

export async function getTabDetail(conn: Conn, tabId: number) {
  const tab = await conn.query.tabs.findFirst({ where: eq(tabs.id, tabId) });
  if (!tab) throw new DomainError("Bill not found", 404);
  const tabOrders = await conn.query.orders.findMany({
    where: eq(orders.tabId, tabId),
    orderBy: asc(orders.createdAt),
  });
  const ids = tabOrders.map((o) => o.id);
  const items = ids.length ? await conn.query.orderItems.findMany({ where: inArray(orderItems.orderId, ids) }) : [];
  const staffIds = new Set<number>();
  const guestIds = new Set<number>();
  for (const o of tabOrders) {
    for (const id of [o.placedByStaffId, o.approvedByStaffId, o.cancelledByStaffId]) if (id) staffIds.add(id);
    if (o.guestId) guestIds.add(o.guestId);
  }
  const staffRows = staffIds.size ? await conn.select({ id: staff.id, name: staff.name }).from(staff).where(inArray(staff.id, [...staffIds])) : [];
  const guestRows = guestIds.size
    ? await conn.select({ id: guests.id, name: guests.name, phone: guests.phone, email: guests.email }).from(guests).where(inArray(guests.id, [...guestIds]))
    : [];
  const staffName = new Map(staffRows.map((s) => [s.id, s.name]));
  const guestName = new Map(guestRows.map((g) => [g.id, g.name || g.phone || g.email || "Guest"]));

  const gstRateBp = tab.gstRateBp ?? (await getGstRateBp(conn));
  const billable = items.filter((i) => {
    const o = tabOrders.find((x) => x.id === i.orderId)!;
    return i.status === "active" && (BILLABLE as readonly string[]).includes(o.status);
  });
  const bill = computeBill(billable, tab.discountPct, gstRateBp);
  return {
    tab,
    bill,
    orders: tabOrders.map((o) => ({
      ...o,
      placedBy: o.placedByStaffId ? staffName.get(o.placedByStaffId) ?? "Staff" : guestName.get(o.guestId ?? -1) ?? "Guest",
      approvedBy: o.approvedByStaffId ? staffName.get(o.approvedByStaffId) ?? null : null,
      cancelledBy: o.cancelledByStaffId ? staffName.get(o.cancelledByStaffId) ?? null : null,
      items: items.filter((i) => i.orderId === o.id),
      billable: (BILLABLE as readonly string[]).includes(o.status),
    })),
    unresolved: tabOrders.filter((o) => o.status === "pending" || o.status === "returned").length,
  };
}

export async function requestBill(db: DB, actor: GuestActor, tableId: number) {
  return db.transaction(async (tx) => {
    const tab = await tx.query.tabs.findFirst({ where: and(eq(tabs.tableId, tableId), eq(tabs.status, "open")) });
    if (!tab) throw new DomainError("There is no open bill for this table");
    const mine = await tx.query.orders.findFirst({ where: and(eq(orders.tabId, tab.id), eq(orders.guestId, actor.id)) });
    if (!mine) throw new DomainError("Only guests who ordered at this table can ask for the bill", 403);
    await tx.update(tabs).set({ billRequestedAt: new Date() }).where(eq(tabs.id, tab.id));
    await audit(tx, actor, "tab.bill_requested", { tableId, tabId: tab.id });
  });
}

export const PAYMENT_METHODS = ["cash", "upi", "card"] as const;

export async function closeTab(
  db: DB,
  actor: StaffActor,
  tabId: number,
  input: { discountPct: number; paymentMethod: string },
) {
  requireRole(actor, ["cashier", "manager"]);
  if (!(PAYMENT_METHODS as readonly string[]).includes(input.paymentMethod)) throw new DomainError("Choose cash, UPI or card");
  const maxDiscount = actor.role === "manager" ? 100 : CASHIER_MAX_DISCOUNT;
  if (!Number.isInteger(input.discountPct) || input.discountPct < 0 || input.discountPct > maxDiscount) {
    throw new DomainError(`Discount must be between 0% and ${maxDiscount}%`);
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from tabs where id = ${tabId} for update`);
    const current = await tx.query.tabs.findFirst({ where: eq(tabs.id, tabId) });
    if (!current) throw new DomainError("Bill not found", 404);
    if (current.status !== "open") throw new DomainError("This bill is already closed");
    const gstRateBp = await getGstRateBp(tx);
    await tx.update(tabs).set({ discountPct: input.discountPct, gstRateBp }).where(eq(tabs.id, tabId));
    const detail = await getTabDetail(tx, tabId);
    if (detail.unresolved > 0) {
      throw new DomainError("Some orders on this table still need a waiter. Approve or cancel them first.");
    }
    await tx
      .update(tabs)
      .set({
        status: "paid",
        closedAt: new Date(),
        closedByStaffId: actor.id,
        paymentMethod: input.paymentMethod,
        totalPaise: detail.bill.totalPaise,
      })
      .where(eq(tabs.id, tabId));
    await audit(
      tx,
      actor,
      "tab.paid",
      { tableId: current.tableId, tabId },
      { ...detail.bill, paymentMethod: input.paymentMethod },
    );
    return detail.bill;
  });
}

// ---------- Staff views ----------

export async function listActiveOrders(db: DB) {
  const open = await db
    .select({ order: orders, table: diningTables, restaurant: restaurants, guest: guests })
    .from(orders)
    .innerJoin(tabs, eq(tabs.id, orders.tabId))
    .innerJoin(diningTables, eq(diningTables.id, orders.tableId))
    .innerJoin(restaurants, eq(restaurants.id, diningTables.restaurantId))
    .leftJoin(guests, eq(guests.id, orders.guestId))
    .where(eq(tabs.status, "open"))
    .orderBy(asc(orders.createdAt));
  const ids = open.map((r) => r.order.id);
  const items = ids.length ? await db.query.orderItems.findMany({ where: inArray(orderItems.orderId, ids) }) : [];
  return open.map((r) => ({
    id: r.order.id,
    status: r.order.status,
    note: r.order.note,
    createdAt: r.order.createdAt,
    updatedAt: r.order.updatedAt,
    tabId: r.order.tabId,
    table: { id: r.table.id, number: r.table.number },
    restaurant: { id: r.restaurant.id, name: r.restaurant.name },
    guest: r.guest ? r.guest.name || r.guest.phone || r.guest.email || "Guest" : "Waiter order",
    items: items.filter((i) => i.orderId === r.order.id).map((i) => ({ id: i.id, name: i.name, qty: i.qty, status: i.status, isVeg: i.isVeg })),
  }));
}

export async function listTablesWithTabs(db: DB) {
  const rows = await db
    .select({ table: diningTables, restaurant: restaurants, tab: tabs })
    .from(diningTables)
    .innerJoin(restaurants, eq(restaurants.id, diningTables.restaurantId))
    .leftJoin(tabs, and(eq(tabs.tableId, diningTables.id), eq(tabs.status, "open")))
    .where(eq(diningTables.active, true))
    .orderBy(asc(restaurants.id), asc(diningTables.number));
  const result = [];
  for (const r of rows) {
    let totalPaise = 0;
    if (r.tab) totalPaise = (await getTabDetail(db, r.tab.id)).bill.totalPaise;
    result.push({
      id: r.table.id,
      number: r.table.number,
      seats: r.table.seats,
      restaurant: { id: r.restaurant.id, name: r.restaurant.name },
      tab: r.tab ? { id: r.tab.id, billRequested: !!r.tab.billRequestedAt, totalPaise } : null,
    });
  }
  return result;
}

export async function todaysSales(db: DB) {
  const start = new Date();
  // Day starts at midnight India time (UTC+5:30).
  const ist = new Date(start.getTime() + 330 * 60_000);
  ist.setUTCHours(0, 0, 0, 0);
  const since = new Date(ist.getTime() - 330 * 60_000);
  const rows = await db
    .select({ total: sql<number>`coalesce(sum(${tabs.totalPaise}), 0)::int`, count: sql<number>`count(*)::int` })
    .from(tabs)
    .where(and(eq(tabs.status, "paid"), gte(tabs.closedAt, since)));
  return rows[0];
}

export async function recentAudit(db: DB, limit = 100) {
  return db.select().from(auditLog).orderBy(desc(auditLog.at), desc(auditLog.id)).limit(Math.min(limit, 500));
}

// ---------- Guest views ----------

export async function guestOrdersAtTable(db: DB, guestId: number, tableId: number) {
  const tab = await db.query.tabs.findFirst({ where: and(eq(tabs.tableId, tableId), eq(tabs.status, "open")) });
  if (!tab) return { tab: null, orders: [] as Awaited<ReturnType<typeof getTabDetail>>["orders"], bill: null };
  const detail = await getTabDetail(db, tab.id);
  return {
    tab: { id: tab.id, billRequested: !!tab.billRequestedAt },
    orders: detail.orders.filter((o) => o.guestId === guestId),
    bill: detail.bill,
  };
}

// ---------- Manager tools ----------

export async function upsertMenuItem(
  db: DB,
  actor: StaffActor,
  input: {
    id?: number;
    categoryId: number;
    name: string;
    description: string;
    pricePaise: number;
    isVeg: boolean;
    isBestseller: boolean;
    imageUrl: string | null;
  },
) {
  requireRole(actor, ["manager"]);
  const name = input.name.trim();
  if (!name || name.length > 80) throw new DomainError("Dish name must be 1 to 80 characters");
  if (!Number.isInteger(input.pricePaise) || input.pricePaise < 0 || input.pricePaise > 10_000_000) throw new DomainError("Price is not valid");
  const imageUrl = input.imageUrl?.trim() || null;
  if (imageUrl && !/^https:\/\//.test(imageUrl)) throw new DomainError("Photo link must start with https://");
  const values = {
    categoryId: input.categoryId,
    name,
    description: input.description.trim().slice(0, 300),
    pricePaise: input.pricePaise,
    isVeg: input.isVeg,
    isBestseller: input.isBestseller,
    imageUrl,
  };
  return db.transaction(async (tx) => {
    if (input.id) {
      const before = await tx.query.menuItems.findFirst({ where: eq(menuItems.id, input.id) });
      if (!before) throw new DomainError("Dish not found", 404);
      await tx.update(menuItems).set(values).where(eq(menuItems.id, input.id));
      await audit(tx, actor, "menu.item_updated", {}, { id: input.id, before: { name: before.name, pricePaise: before.pricePaise }, after: { name, pricePaise: input.pricePaise } });
      return input.id;
    }
    const [row] = await tx.insert(menuItems).values(values).returning();
    await audit(tx, actor, "menu.item_created", {}, { id: row.id, name, pricePaise: input.pricePaise });
    return row.id;
  });
}

export async function setMenuItemStock(db: DB, actor: StaffActor, id: number, inStock: boolean) {
  requireRole(actor, ["manager", "waiter", "kitchen"]);
  await db.transaction(async (tx) => {
    const item = await tx.query.menuItems.findFirst({ where: eq(menuItems.id, id) });
    if (!item) throw new DomainError("Dish not found", 404);
    await tx.update(menuItems).set({ inStock }).where(eq(menuItems.id, id));
    await audit(tx, actor, inStock ? "menu.back_in_stock" : "menu.sold_out", {}, { id, name: item.name });
  });
}

export async function archiveMenuItem(db: DB, actor: StaffActor, id: number) {
  requireRole(actor, ["manager"]);
  await db.transaction(async (tx) => {
    const item = await tx.query.menuItems.findFirst({ where: eq(menuItems.id, id) });
    if (!item) throw new DomainError("Dish not found", 404);
    await tx.update(menuItems).set({ archived: true }).where(eq(menuItems.id, id));
    await audit(tx, actor, "menu.item_removed", {}, { id, name: item.name });
  });
}

export async function addTable(db: DB, actor: StaffActor, input: { restaurantId: number; number: number; seats: number; qrToken: string }) {
  requireRole(actor, ["manager"]);
  if (!Number.isInteger(input.number) || input.number < 1 || input.number > 999) throw new DomainError("Table number must be 1 to 999");
  if (!Number.isInteger(input.seats) || input.seats < 1 || input.seats > 40) throw new DomainError("Seats must be 1 to 40");
  return db.transaction(async (tx) => {
    const clash = await tx.query.diningTables.findFirst({
      where: and(eq(diningTables.restaurantId, input.restaurantId), eq(diningTables.number, input.number)),
    });
    if (clash) {
      if (clash.active) throw new DomainError(`Table ${input.number} already exists`);
      await tx.update(diningTables).set({ active: true, seats: input.seats }).where(eq(diningTables.id, clash.id));
      await audit(tx, actor, "table.restored", { tableId: clash.id }, { number: input.number, seats: input.seats });
      return clash.id;
    }
    const [row] = await tx.insert(diningTables).values(input).returning();
    await audit(tx, actor, "table.added", { tableId: row.id }, { number: input.number, seats: input.seats });
    return row.id;
  });
}

export async function updateTable(db: DB, actor: StaffActor, id: number, input: { seats?: number; active?: boolean }) {
  requireRole(actor, ["manager"]);
  if (input.seats !== undefined && (!Number.isInteger(input.seats) || input.seats < 1 || input.seats > 40)) {
    throw new DomainError("Seats must be 1 to 40");
  }
  await db.transaction(async (tx) => {
    const t = await tx.query.diningTables.findFirst({ where: eq(diningTables.id, id) });
    if (!t) throw new DomainError("Table not found", 404);
    if (input.active === false) {
      const open = await tx.query.tabs.findFirst({ where: and(eq(tabs.tableId, id), eq(tabs.status, "open")) });
      if (open) throw new DomainError("This table has an open bill. Close it first.");
    }
    await tx.update(diningTables).set(input).where(eq(diningTables.id, id));
    await audit(tx, actor, "table.updated", { tableId: id }, input);
  });
}

export async function addStaff(db: DB, actor: StaffActor, input: { name: string; phone: string; role: StaffRole; pinHash: string }) {
  requireRole(actor, ["manager"]);
  const name = input.name.trim();
  if (!name) throw new DomainError("Name is required");
  return db.transaction(async (tx) => {
    const clash = await tx.query.staff.findFirst({ where: eq(staff.phone, input.phone) });
    if (clash) throw new DomainError("Someone already uses this mobile number");
    const [row] = await tx.insert(staff).values({ ...input, name }).returning({ id: staff.id });
    await audit(tx, actor, "staff.added", {}, { id: row.id, name, role: input.role });
    return row.id;
  });
}

export async function setStaffActive(db: DB, actor: StaffActor, id: number, active: boolean) {
  requireRole(actor, ["manager"]);
  if (id === actor.id && !active) throw new DomainError("You can't switch off your own account");
  await db.transaction(async (tx) => {
    const s = await tx.query.staff.findFirst({ where: eq(staff.id, id) });
    if (!s) throw new DomainError("Staff member not found", 404);
    await tx.update(staff).set({ active, failedLogins: 0, lockedUntil: null }).where(eq(staff.id, id));
    await audit(tx, actor, active ? "staff.enabled" : "staff.disabled", {}, { id, name: s.name });
  });
}

