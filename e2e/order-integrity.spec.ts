import { expect, test, type APIRequestContext } from "@playwright/test";
import { computeBill } from "../src/lib/money";
import { STAFF_STATE, bypassHeaders, freeTable, guestLogin, isRemote, orderableDishes, testTable } from "./helpers";

/**
 * Order rules from the user-testing report: the server sets prices and GST,
 * a guest's cart survives a dish selling out, an unavailable dish can be
 * swapped, and a retried order never doubles up. These place real orders, so
 * they run on a local copy.
 */

test.describe("Order integrity", () => {
  test.skip(isRemote(), "places orders and changes stock, so it runs on a local copy");

  let staff: APIRequestContext;
  test.beforeEach(async ({ playwright, baseURL }) => {
    staff = await playwright.request.newContext({ baseURL, storageState: STAFF_STATE, extraHTTPHeaders: bypassHeaders() });
    expect(await freeTable(staff, testTable())).toBe(true);
  });
  test.afterEach(async () => {
    await freeTable(staff, testTable());
    await staff.dispose();
  });

  test("the server sets prices and GST, whatever the phone sends", async ({ playwright, baseURL }) => {
    const t = testTable();
    const guest = await playwright.request.newContext({ baseURL });
    const { token } = await guestLogin(guest, staff, t);
    const [a, b] = await orderableDishes(staff, t);

    // A tampered request with made-up prices and totals.
    const res = await guest.post(`/api/t/${token}/orders`, {
      data: { lines: [{ menuItemId: a.id, qty: 2, pricePaise: 1 }, { menuItemId: b.id, qty: 1, pricePaise: 1 }], totalPaise: 1 },
    });
    expect(res.ok(), await res.text()).toBeTruthy();

    const { bill } = (await (await guest.get(`/api/t/${token}/orders`)).json()) as { bill: { subtotalPaise: number; totalPaise: number; gstRateBp: number } };
    const { gstPercent } = (await (await staff.get("/api/staff/settings")).json()) as { gstPercent: number };
    // Orders count on the bill once a waiter approves, so compare what the guest is shown with the menu.
    const expected = computeBill([{ pricePaise: a.pricePaise, qty: 2 }, { pricePaise: b.pricePaise, qty: 1 }], 0, Math.round(gstPercent * 100));
    const { orders } = (await (await guest.get(`/api/t/${token}/orders`)).json()) as { orders: { items: { pricePaise: number; qty: number }[] }[] };
    const charged = orders[0].items.reduce((sum, i) => sum + i.pricePaise * i.qty, 0);
    expect(charged, "line prices come from the menu, not the phone").toBe(expected.subtotalPaise);
    expect(bill.gstRateBp).toBe(Math.round(gstPercent * 100));
    await guest.dispose();
  });

  test("bad quantities are refused by the server", async ({ playwright, baseURL }) => {
    const t = testTable();
    const guest = await playwright.request.newContext({ baseURL });
    const { token } = await guestLogin(guest, staff, t);
    const [a] = await orderableDishes(staff, t);
    for (const qty of [0, -1, 21, 1.5]) {
      const res = await guest.post(`/api/t/${token}/orders`, { data: { lines: [{ menuItemId: a.id, qty }] } });
      expect(res.status(), `qty ${qty}`).toBe(400);
    }
    const empty = await guest.post(`/api/t/${token}/orders`, { data: { lines: [] } });
    expect(empty.status()).toBe(400);
    await guest.dispose();
  });

  test("a dish selling out keeps the cart and says which dish", async ({ page }) => {
    const t = testTable();
    await guestLogin(page.request, staff, t);
    const [a, b] = await orderableDishes(staff, t);
    await page.goto(t.path);
    await page.getByRole("button", { name: `Add ${a.name}`, exact: true }).first().click();
    await page.getByRole("button", { name: `Add ${b.name}`, exact: true }).first().click();
    await page.getByRole("button", { name: /2 items.*View cart/ }).click();

    // The kitchen marks one dish sold out while the guest is looking at the cart.
    expect((await staff.patch(`/api/staff/menu/${b.id}`, { data: { inStock: false } })).ok()).toBeTruthy();
    try {
      await page.getByRole("button", { name: /^Place order · ₹/ }).click();
      await expect(page.getByRole("alert").filter({ hasText: `${b.name} is sold out` })).toBeVisible();
      await expect(page.getByText(a.name, { exact: true }), "the rest of the cart is still there").toBeVisible();
      await expect(page.getByText(b.name, { exact: true }), "the guest decides what to do with it").toBeVisible();
    } finally {
      await staff.patch(`/api/staff/menu/${b.id}`, { data: { inStock: true } });
    }
  });

  test("guest can swap an unavailable dish for another", async ({ page }) => {
    const t = testTable();
    const { token } = await guestLogin(page.request, staff, t);
    const [a, b] = await orderableDishes(staff, t);
    const placed = await page.request.post(`/api/t/${token}/orders`, { data: { lines: [{ menuItemId: a.id, qty: 1 }, { menuItemId: b.id, qty: 1 }] } });
    expect(placed.ok()).toBeTruthy();

    // Waiter marks one dish unavailable and sends the order back.
    const { orders } = (await (await staff.get("/api/staff/orders")).json()) as { orders: { id: number; items: { id: number; name: string }[] }[] };
    const order = orders.at(-1)!;
    const itemB = order.items.find((i) => i.name === b.name)!;
    await staff.post(`/api/staff/order-items/${itemB.id}`, { data: { unavailable: true } });
    await staff.post(`/api/staff/orders/${order.id}/approve`, { data: {} });

    await page.goto(t.path);
    await page.getByRole("button", { name: /My orders/ }).click();
    await expect(page.getByText(`${b.name} is not available right now`)).toBeVisible();
    await page.getByRole("button", { name: "Pick another dish" }).click();
    await expect(page.getByPlaceholder("Search dishes"), "back on the menu to choose").toBeVisible();

    const after = (await (await staff.get("/api/staff/orders")).json()) as { orders: { id: number; status: string; items: { name: string; status: string }[] }[] };
    const same = after.orders.find((o) => o.id === order.id)!;
    expect(same.status, "the rest goes back to the waiter").toBe("pending");
    expect(same.items.find((i) => i.name === b.name)!.status).toBe("removed");
  });

  // The report asks for an idempotency key so a retried request (bad network,
  // double tap that beats the button guard) can't create a second order.
  // The app doesn't have one yet; switch this on when it does.
  test.fixme("a retried order request creates one order, not two", async ({ playwright, baseURL }) => {
    const t = testTable();
    const guest = await playwright.request.newContext({ baseURL });
    const { token } = await guestLogin(guest, staff, t);
    const [a] = await orderableDishes(staff, t);
    const body = { data: { lines: [{ menuItemId: a.id, qty: 1 }] }, headers: { "idempotency-key": "e2e-retry-1" } };
    await Promise.all([guest.post(`/api/t/${token}/orders`, body), guest.post(`/api/t/${token}/orders`, body)]);
    const { orders } = (await (await guest.get(`/api/t/${token}/orders`)).json()) as { orders: unknown[] };
    expect(orders).toHaveLength(1);
  });
});
