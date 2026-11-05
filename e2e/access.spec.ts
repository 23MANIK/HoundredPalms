import { expect, test } from "@playwright/test";
import { ROLE_STATE, isRemote } from "./helpers";

/**
 * Each staff role sees only its own screens, and the server refuses the rest
 * even when someone calls the API directly. Runs on a local copy, which has a
 * login for every role.
 */

test.describe("Who can open what", () => {
  test.skip(isRemote(), "needs a login for every role, which only the local copy has");

  const pages = [
    { role: "waiter", home: "/staff/waiter", blocked: ["/staff/manager", "/staff/manager/qr", "/staff/cashier", "/staff/kitchen"] },
    { role: "kitchen", home: "/staff/kitchen", blocked: ["/staff/manager", "/staff/cashier", "/staff/waiter", "/staff/waiter/new"] },
    { role: "cashier", home: "/staff/cashier", blocked: ["/staff/manager", "/staff/kitchen", "/staff/waiter"] },
  ] as const;

  for (const p of pages) {
    test.describe(`${p.role}`, () => {
      test.use({ storageState: ROLE_STATE(p.role) });

      test(`is sent back to their own screen from other screens`, async ({ page }) => {
        for (const path of p.blocked) {
          await page.goto(path);
          await expect(page, `${p.role} opening ${path}`).toHaveURL(new RegExp(`${p.home}$`));
        }
      });
    });
  }

  const apiDenied = [
    { role: "waiter", method: "post", url: "/api/staff/settings", data: { gstPercent: 0 }, why: "change GST" },
    { role: "waiter", method: "post", url: "/api/staff/tabs/1/close", data: { discountPct: 100, paymentMethod: "cash" }, why: "close a bill" },
    { role: "waiter", method: "get", url: "/api/staff/audit", why: "read the activity log" },
    { role: "kitchen", method: "post", url: "/api/staff/orders/1/approve", data: {}, why: "approve an order" },
    { role: "kitchen", method: "post", url: "/api/staff/team", data: { name: "X", phone: "9876500000", role: "manager", pin: "1234" }, why: "add staff" },
    { role: "kitchen", method: "get", url: "/api/staff/login-codes", why: "see guest login codes" },
    { role: "cashier", method: "post", url: "/api/staff/menu", data: { categoryId: 1, name: "X", description: "", priceRupees: 1, isVeg: true, isBestseller: false, imageUrl: null }, why: "edit the menu" },
    { role: "cashier", method: "post", url: "/api/staff/tables", data: { restaurantId: 1, number: 500, seats: 2 }, why: "add a table" },
  ] as const;

  for (const a of apiDenied) {
    test.describe(`${a.role} API`, () => {
      test.use({ storageState: ROLE_STATE(a.role) });
      test(`can't ${a.why}`, async ({ request }) => {
        const res = a.method === "get" ? await request.get(a.url) : await request.post(a.url, { data: "data" in a ? a.data : {} });
        expect(res.status(), `${a.role} ${a.method.toUpperCase()} ${a.url}: ${await res.text()}`).toBe(403);
      });
    });
  }
});

test.describe("Signed-out and guest access", () => {
  test("staff APIs refuse anyone who isn't signed in", async ({ request }) => {
    for (const url of ["/api/staff/orders", "/api/staff/tables", "/api/staff/audit", "/api/staff/login-codes"]) {
      const res = await request.get(url);
      expect(res.status(), `GET ${url} without a login`).toBe(401);
    }
    const close = await request.post("/api/staff/tabs/1/close", { data: { discountPct: 100, paymentMethod: "cash" } });
    expect(close.status()).toBe(401);
  });

  test("guest APIs refuse anyone who isn't signed in", async ({ request }) => {
    const res = await request.post("/api/t/any-table/orders", { data: { lines: [{ menuItemId: 1, qty: 1 }] } });
    expect(res.status()).toBe(401);
  });

  test("cross-site form posts are refused", async ({ request }) => {
    const res = await request.post("/api/staff/login", {
      headers: { "content-type": "application/x-www-form-urlencoded" },
      data: "phone=9999999999&pin=1234",
    });
    expect(res.status()).toBe(415);
  });
});
