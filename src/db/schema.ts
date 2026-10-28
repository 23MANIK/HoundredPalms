import {
  pgTable,
  pgEnum,
  serial,
  integer,
  text,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const staffRole = pgEnum("staff_role", ["waiter", "kitchen", "cashier", "manager"]);

// pending: waiting for a waiter; returned: waiter flagged items, guest must choose;
// approved -> preparing -> ready -> served is the kitchen path; cancelled is waiter-only.
export const orderStatus = pgEnum("order_status", [
  "pending",
  "returned",
  "approved",
  "preparing",
  "ready",
  "served",
  "cancelled",
]);

// active: will be cooked and billed; unavailable: waiter flagged it (not billed);
// removed: guest dropped it after it was flagged (not billed).
export const orderItemStatus = pgEnum("order_item_status", ["active", "unavailable", "removed"]);

export const tabStatus = pgEnum("tab_status", ["open", "paid"]);

export const restaurants = pgTable("restaurants", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  tagline: text("tagline").notNull().default(""),
  vegOnly: boolean("veg_only").notNull().default(false),
});

export const diningTables = pgTable(
  "dining_tables",
  {
    id: serial("id").primaryKey(),
    restaurantId: integer("restaurant_id")
      .notNull()
      .references(() => restaurants.id),
    number: integer("number").notNull(),
    seats: integer("seats").notNull().default(4),
    // Random, unguessable token printed in the table's QR code.
    qrToken: text("qr_token").notNull().unique(),
    active: boolean("active").notNull().default(true),
  },
  (t) => [uniqueIndex("dining_tables_restaurant_number").on(t.restaurantId, t.number)],
);

export const menuCategories = pgTable("menu_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  sort: integer("sort").notNull().default(0),
});

export const menuItems = pgTable("menu_items", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id")
    .notNull()
    .references(() => menuCategories.id),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  // Money is stored in paise (1 rupee = 100 paise) to avoid rounding errors.
  pricePaise: integer("price_paise").notNull(),
  isVeg: boolean("is_veg").notNull(),
  isBestseller: boolean("is_bestseller").notNull().default(false),
  imageUrl: text("image_url"),
  // Sold-out switch the manager or waiter flips during service.
  inStock: boolean("in_stock").notNull().default(true),
  archived: boolean("archived").notNull().default(false),
  sort: integer("sort").notNull().default(0),
});

export const guests = pgTable("guests", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().default(""),
  email: text("email"),
  googleSub: text("google_sub").unique(),
  phone: text("phone").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const staff = pgTable("staff", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
  pinHash: text("pin_hash").notNull(),
  role: staffRole("role").notNull(),
  active: boolean("active").notNull().default(true),
  failedLogins: integer("failed_logins").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const otpCodes = pgTable(
  "otp_codes",
  {
    id: serial("id").primaryKey(),
    phone: text("phone").notNull(),
    ip: text("ip"),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("otp_codes_phone").on(t.phone, t.createdAt), index("otp_codes_ip").on(t.ip, t.createdAt)],
);

// A tab is one running bill for a table, from the first order until the cashier closes it.
export const tabs = pgTable(
  "tabs",
  {
    id: serial("id").primaryKey(),
    tableId: integer("table_id")
      .notNull()
      .references(() => diningTables.id),
    status: tabStatus("status").notNull().default("open"),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    billRequestedAt: timestamp("bill_requested_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedByStaffId: integer("closed_by_staff_id").references(() => staff.id),
    discountPct: integer("discount_pct").notNull().default(0),
    gstRateBp: integer("gst_rate_bp"),
    paymentMethod: text("payment_method"),
    totalPaise: integer("total_paise"),
  },
  (t) => [index("tabs_table_status").on(t.tableId, t.status)],
);

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    tabId: integer("tab_id")
      .notNull()
      .references(() => tabs.id),
    tableId: integer("table_id")
      .notNull()
      .references(() => diningTables.id),
    guestId: integer("guest_id").references(() => guests.id),
    placedByStaffId: integer("placed_by_staff_id").references(() => staff.id),
    status: orderStatus("status").notNull().default("pending"),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    approvedByStaffId: integer("approved_by_staff_id").references(() => staff.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    cancelledByStaffId: integer("cancelled_by_staff_id").references(() => staff.id),
    cancelReason: text("cancel_reason"),
  },
  (t) => [index("orders_status").on(t.status), index("orders_tab").on(t.tabId)],
);

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id),
  menuItemId: integer("menu_item_id")
    .notNull()
    .references(() => menuItems.id),
  // Name and price are copied at order time so later menu edits never change a bill.
  name: text("name").notNull(),
  pricePaise: integer("price_paise").notNull(),
  isVeg: boolean("is_veg").notNull(),
  qty: integer("qty").notNull(),
  status: orderItemStatus("status").notNull().default("active"),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    actorType: text("actor_type").notNull(), // guest | staff | system
    actorId: integer("actor_id"),
    actorName: text("actor_name").notNull(),
    action: text("action").notNull(),
    tableId: integer("table_id"),
    tabId: integer("tab_id"),
    orderId: integer("order_id"),
    details: jsonb("details").notNull().default({}),
  },
  (t) => [index("audit_log_at").on(t.at), index("audit_log_tab").on(t.tabId)],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
