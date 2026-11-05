import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { staff } from "@/db/schema";
import { closeDb } from "@/db";
import {
  createOtp,
  guestSessionToken,
  listWaiterCodes,
  loadGuest,
  loadStaff,
  normalizeIndianPhone,
  readSession,
  readSessionClaims,
  signSession,
  staffLogin,
  verifyOtp,
} from "@/lib/auth";
import { addStaff, approveOrder, closeTab, placeOrder, resetStaffPin } from "@/lib/domain";
import { hashPin } from "@/lib/crypto";
import { isPlaceholderPhone } from "@/lib/live-site";
import { pinProblem } from "@/lib/pin";
import { phoneProblem, readPhoneInput } from "@/lib/phone";
import { fixture } from "./helpers";

let f: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => {
  f = await fixture();
});
afterAll(async () => {
  await closeDb();
});

describe("phone numbers", () => {
  it("normalises Indian mobiles", () => {
    expect(normalizeIndianPhone("98765 43210")).toBe("+919876543210");
    expect(normalizeIndianPhone("+91-98765-43210")).toBe("+919876543210");
    expect(normalizeIndianPhone("09876543210")).toBe("+919876543210");
    expect(() => normalizeIndianPhone("12345")).toThrow();
    expect(() => normalizeIndianPhone("5876543210")).toThrow(/start with 6, 7, 8 or 9/);
  });

  it("refuses letters and extra digits instead of dropping them", () => {
    expect(() => normalizeIndianPhone("98765a3210")).toThrow(/only have digits/);
    expect(() => normalizeIndianPhone("98765432101")).toThrow(/only 10 digits/);
    expect(() => normalizeIndianPhone("+1 98765 43210")).toThrow(/\+91/);
    expect(() => normalizeIndianPhone("98765")).toThrow(/all 10 digits/);
  });

  it("reads typed and pasted input the way the screens do", () => {
    expect(readPhoneInput("+91 98765-43210")).toEqual({ digits: "9876543210", error: null });
    expect(readPhoneInput("098765 43210")).toEqual({ digits: "9876543210", error: null });
    expect(readPhoneInput("(987) 654-3210")).toEqual({ digits: "9876543210", error: null });
    expect(readPhoneInput("987654321").error).toBeNull();
    expect(readPhoneInput("98765432109").error).toMatch(/only 10 digits/);
    expect(readPhoneInput("9876x").error).toMatch(/only have digits/);
    expect(readPhoneInput("98+765").error).toMatch(/only have digits/);
    expect(phoneProblem("98765")).toMatch(/5 so far/);
    expect(phoneProblem("9876543210")).toBeNull();
  });
});

describe("OTP", () => {
  it("logs in with the right code once, and rejects reuse", async () => {
    const code = await createOtp(f.db, "+919876543210");
    const g = await verifyOtp(f.db, "+919876543210", code);
    expect(g.kind).toBe("guest");
    await expect(verifyOtp(f.db, "+919876543210", code)).rejects.toThrow();
  });

  it("locks after 5 wrong tries", async () => {
    const code = await createOtp(f.db, "+919876543211");
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) await expect(verifyOtp(f.db, "+919876543211", wrong)).rejects.toThrow(/not right/);
    await expect(verifyOtp(f.db, "+919876543211", code)).rejects.toThrow(/Too many/);
  });

  it("limits code requests to 3 per 10 minutes", async () => {
    for (let i = 0; i < 3; i++) await createOtp(f.db, "+919876543212");
    await expect(createOtp(f.db, "+919876543212")).rejects.toThrow(/Too many/);
  });
});

describe("code from the waiter", () => {
  it("shows the code to staff until the guest uses it", async () => {
    const code = await createOtp(f.db, "+919876543213", null, f.table.id);
    const shown = await listWaiterCodes(f.db);
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ code, phoneLast4: "3213", table: { number: 7 } });
    await verifyOtp(f.db, "+919876543213", code);
    expect(await listWaiterCodes(f.db)).toHaveLength(0);
  });

  it("shows only the newest code per number, and never SMS codes", async () => {
    await createOtp(f.db, "+919876543214");
    await createOtp(f.db, "+919876543214", null, f.table.id);
    const newest = await createOtp(f.db, "+919876543214", null, f.table.id);
    const shown = await listWaiterCodes(f.db);
    expect(shown.map((c) => c.code)).toEqual([newest]);
  });

  it("hides a code after 5 wrong tries", async () => {
    const code = await createOtp(f.db, "+919876543215", null, f.table.id);
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) await expect(verifyOtp(f.db, "+919876543215", wrong)).rejects.toThrow(/not right/);
    expect(await listWaiterCodes(f.db)).toHaveLength(0);
  });
});

describe("staff login", () => {
  it("accepts the right PIN and locks after 5 wrong ones", async () => {
    const s = await staffLogin(f.db, "+919000000001", "1234");
    expect(s.role).toBe("waiter");
    for (let i = 0; i < 5; i++) await expect(staffLogin(f.db, "+919000000001", "0000")).rejects.toThrow(/wrong/);
    await expect(staffLogin(f.db, "+919000000001", "1234")).rejects.toThrow(/Too many/);
  });
});

describe("no shared default staff login on the live site", () => {
  const liveSite = () => vi.stubEnv("VERCEL_ENV", "production");
  afterEach(() => vi.unstubAllEnvs());

  it("spots placeholder numbers like 9999999999", () => {
    expect(isPlaceholderPhone("+919999999999")).toBe(true);
    expect(isPlaceholderPhone("8888888888")).toBe(true);
    expect(isPlaceholderPhone("+919000000004")).toBe(false);
  });

  it("refuses a placeholder number on the live site, even with the right PIN", async () => {
    const [s] = await f.db.insert(staff).values({ name: "Manager", phone: "+919999999999", pinHash: await hashPin("1234"), role: "manager" }).returning();
    expect((await staffLogin(f.db, s.phone, "1234")).id).toBe(s.id);
    liveSite();
    await expect(staffLogin(f.db, s.phone, "1234")).rejects.toThrow(/wrong/);
  });

  it("won't add a staff login with a placeholder number on the live site", async () => {
    liveSite();
    await expect(addStaff(f.db, f.manager, { name: "Test", phone: "+919999999999", role: "manager", pinHash: "x" })).rejects.toThrow(/real mobile/);
  });

  it("refuses PINs that are easy to guess", () => {
    for (const pin of ["1234", "0000", "4321", "123456", "999999", "0123"]) expect(pinProblem(pin)).toMatch(/easy to guess/);
    expect(pinProblem("12a4")).toMatch(/only have digits/);
    expect(pinProblem("123")).toMatch(/4 to 6/);
    expect(pinProblem("4826")).toBeNull();
    expect(pinProblem("1357")).toBeNull();
  });
});

describe("resetting a staff PIN", () => {
  it("only a manager can do it, and the old PIN and old sessions stop working", async () => {
    await expect(resetStaffPin(f.db, f.waiter, f.cashier.id, await hashPin("4826"))).rejects.toThrow(/permission/);
    const before = await staffLogin(f.db, "+919000000001", "1234");
    const oldSession = { id: before.id, v: before.sessionVersion };
    expect(await loadStaff(f.db, oldSession)).not.toBeNull();

    const v = await resetStaffPin(f.db, f.manager, f.waiter.id, await hashPin("4826"));
    expect(v).toBe(before.sessionVersion + 1);
    expect(await loadStaff(f.db, oldSession)).toBeNull();
    await expect(staffLogin(f.db, "+919000000001", "1234")).rejects.toThrow(/wrong/);
    const after = await staffLogin(f.db, "+919000000001", "4826");
    expect(await loadStaff(f.db, { id: after.id, v: after.sessionVersion })).not.toBeNull();
  });
});

describe("sessions", () => {
  it("a guest token is not accepted as a staff token", async () => {
    const t = await signSession({ kind: "guest", id: 5 }, 60);
    expect(await readSession(t, "guest")).toBe(5);
    expect(await readSession(t, "staff")).toBeNull();
    expect(await readSession(t + "x", "guest")).toBeNull();
  });
});

describe("sign out after paying", () => {
  it("ends the session of everyone who ordered once the bill is paid", async () => {
    const claims = async (id: number) => readSessionClaims(await guestSessionToken(f.db, id), "guest");
    const priyaBefore = await claims(f.priya.id);
    const amitBefore = await claims(f.amit.id);
    expect(await loadGuest(f.db, priyaBefore)).toMatchObject({ id: f.priya.id });

    const o = await placeOrder(f.db, f.priya, { tableId: f.table.id, lines: [{ menuItemId: f.paneer.id, qty: 1 }] });
    await approveOrder(f.db, f.waiter, o.id);
    await closeTab(f.db, f.cashier, o.tabId, { discountPct: 0, paymentMethod: "cash" });

    expect(await loadGuest(f.db, priyaBefore)).toBeNull();
    // Amit did not order on that bill, so he stays signed in.
    expect(await loadGuest(f.db, amitBefore)).toMatchObject({ id: f.amit.id });
    // Signing in again works.
    expect(await loadGuest(f.db, await claims(f.priya.id))).toMatchObject({ id: f.priya.id });
  });
});

describe("OTP per device limit", () => {
  it("limits one device to 10 codes an hour across numbers", async () => {
    for (let i = 0; i < 10; i++) await createOtp(f.db, `+91987654${String(3300 + i)}`, "1.2.3.4");
    await expect(createOtp(f.db, "+919876543399", "1.2.3.4")).rejects.toThrow(/this device/);
    await createOtp(f.db, "+919876543399", "5.6.7.8");
  });
});
