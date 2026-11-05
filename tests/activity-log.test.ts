import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { closeDb } from "@/db";
import { auditLog } from "@/db/schema";
import { createOtp, loadGuest, verifyOtp } from "@/lib/auth";
import { AUDIT_EVENTS, describeAction } from "@/lib/audit-events";
import { approveOrder, getTabDetail, listActiveOrders, placeOrder, recentAudit } from "@/lib/domain";
import { guestLabel, maskEmail, maskPhone, redactText, redactValue } from "@/lib/privacy";
import { fixture } from "./helpers";

let f: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => {
  f = await fixture();
});
afterAll(async () => {
  await closeDb();
});

const PHONE = "+919876543210";

describe("masking personal details", () => {
  it("keeps only the last 4 digits of a mobile number", () => {
    expect(maskPhone(PHONE)).toBe("••••3210");
    expect(maskPhone("98765 43210")).toBe("••••3210");
    expect(maskPhone("12")).toBe("••••");
  });

  it("hides most of an email address", () => {
    expect(maskEmail("priya.sharma@gmail.com")).toBe("p•••@gmail.com");
    expect(maskEmail("not-an-email")).toBe("•••");
  });

  it("finds numbers and emails inside free text", () => {
    expect(redactText(`call me on ${PHONE} or 98765-43210`)).toBe("call me on ••••3210 or ••••3210");
    expect(redactText("mail priya@gmail.com please")).toBe("mail p•••@gmail.com please");
    // Prices, table numbers and order numbers are left alone.
    expect(redactText("2× Paneer, table 12, ₹290, order #4512")).toBe("2× Paneer, table 12, ₹290, order #4512");
  });

  it("masks inside nested details without changing their shape", () => {
    expect(redactValue({ note: `ring ${PHONE}`, items: [{ name: "Dal", qty: 2 }], totalPaise: 29000 })).toEqual({
      note: "ring ••••3210",
      items: [{ name: "Dal", qty: 2 }],
      totalPaise: 29000,
    });
  });

  it("shows staff a guest's name, else a masked number or email", () => {
    expect(guestLabel({ name: "Priya", phone: PHONE })).toBe("Priya");
    expect(guestLabel({ name: null, phone: PHONE })).toBe("Guest ••••3210");
    expect(guestLabel({ email: "priya@gmail.com" })).toBe("Guest p•••@gmail.com");
    expect(guestLabel({})).toBe("Guest");
  });
});

describe("activity log words", () => {
  it("has plain words for every event, never a code", () => {
    for (const [key, words] of Object.entries(AUDIT_EVENTS)) {
      expect(words, key).not.toMatch(/[._]/);
      expect(describeAction(key)).toBe(words);
    }
    expect(describeAction("guest.login_waiter_code")).toBe("signed in with a code from the waiter");
  });

  it("turns an unknown or old event into words", () => {
    expect(describeAction("table.moved_tab")).toBe("other activity (table moved tab)");
    expect(describeAction("")).toBe("other activity");
  });

  it("has words for every event the code records", () => {
    // Catches an event key written somewhere the type check can't see.
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(name)) files.push(p);
      }
    };
    walk(path.resolve(__dirname, "../src/lib"));
    const used = new Set<string>();
    for (const file of files) {
      for (const m of readFileSync(file, "utf8").matchAll(/"((?:order|item|tab|menu|table|staff|guest|settings)\.[a-z_]+)"/g)) used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(10);
    for (const key of used) expect(Object.keys(AUDIT_EVENTS), key).toContain(key);
  });
});

describe("activity log privacy", () => {
  async function guestWithoutName() {
    const code = await createOtp(f.db, PHONE, null, f.table.id);
    const g = await verifyOtp(f.db, PHONE, code);
    const row = await f.db.query.guests.findFirst({ where: (t, { eq }) => eq(t.id, g.id) });
    // The guest as the app loads them from their session cookie.
    return (await loadGuest(f.db, { id: g.id, v: row!.sessionVersion }))!;
  }

  it("never shows a full mobile number or a raw event key to the manager", async () => {
    const guest = await guestWithoutName();
    const order = await placeOrder(f.db, guest, {
      tableId: f.table.id,
      lines: [{ menuItemId: f.paneer.id, qty: 1 }],
      note: `less spicy, call ${PHONE} if late`,
    });
    await approveOrder(f.db, f.waiter, order.id);

    const entries = await recentAudit(f.db);
    const text = JSON.stringify(entries);
    expect(text).not.toContain("9876543210");
    expect(text).toContain("••••3210");

    const login = entries.find((e) => e.action === "guest.login_waiter_code")!;
    expect(login.label).toBe("signed in with a code from the waiter");
    expect(login.actorName).toBe("••••3210");
    const placed = entries.find((e) => e.action === "order.placed")!;
    expect(placed.label).toBe("placed an order");
    expect(placed.actorName).toBe("••••3210");
    expect(placed.details.note).toBe("less spicy, call ••••3210 if late");
    expect(entries.find((e) => e.action === "order.approved")!.actorName).toBe("Ramesh");
  });

  it("stores masked numbers, so the raw table holds no full number either", async () => {
    const guest = await guestWithoutName();
    await placeOrder(f.db, guest, { tableId: f.table.id, lines: [{ menuItemId: f.dal.id, qty: 1 }] });
    const raw = JSON.stringify(await f.db.select().from(auditLog));
    expect(raw).not.toContain("9876543210");
  });

  it("masks rows written before this change", async () => {
    await f.db.insert(auditLog).values({ actorType: "guest", actorName: PHONE, action: "guest.login_waiter_code", details: { note: PHONE } });
    const [e] = await recentAudit(f.db);
    expect(e.actorName).toBe("••••3210");
    expect(e.details).toEqual({ note: "••••3210" });
    expect(e.label).toBe("signed in with a code from the waiter");
  });

  it("shows waiters and cashiers a masked number for a guest with no name", async () => {
    const guest = await guestWithoutName();
    const order = await placeOrder(f.db, guest, { tableId: f.table.id, lines: [{ menuItemId: f.dal.id, qty: 1 }] });
    const active = await listActiveOrders(f.db);
    expect(active.find((o) => o.id === order.id)!.guest).toBe("Guest ••••3210");
    const tab = await getTabDetail(f.db, order.tabId);
    expect(JSON.stringify(tab)).not.toContain("9876543210");
    expect(tab.orders[0].placedBy).toBe("Guest ••••3210");
  });

  it("still lets the guest see their own number", async () => {
    const guest = await guestWithoutName();
    expect(guest.name).toBe(PHONE);
  });
});
