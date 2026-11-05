import { expect, test, type APIRequestContext } from "@playwright/test";
import { STAFF_STATE, bypassHeaders, freeTable, guestLogin, isRemote, orderableDishes, testTable } from "./helpers";

/**
 * The activity log and staff screens never show a guest's full mobile number,
 * and events read as plain words, not internal keys like "guest.login_waiter_code".
 */

const masked = (phone: string) => `••••${phone.slice(-4)}`;

test.describe("Private, readable activity log", () => {
  test.skip(isRemote(), "signs in a guest without a name and places an order, so it runs on a local copy");
  test.use({ storageState: STAFF_STATE });

  let staff: APIRequestContext;
  test.beforeEach(async ({ playwright, baseURL }) => {
    staff = await playwright.request.newContext({ baseURL, storageState: STAFF_STATE, extraHTTPHeaders: bypassHeaders() });
    expect(await freeTable(staff, testTable())).toBe(true);
  });
  test.afterEach(async () => {
    // Orders from a guest with no name aren't "E2E Test Guest", so close them here.
    const { tables } = (await (await staff.get("/api/staff/tables")).json()) as { tables: { number: number; restaurant: { name: string }; tab: { id: number } | null }[] };
    const t = testTable();
    const tab = tables.find((r) => r.number === t.number && r.restaurant.name === t.restaurant)?.tab;
    if (tab) {
      const { orders } = (await (await staff.get("/api/staff/orders")).json()) as { orders: { id: number; tabId: number; status: string }[] };
      for (const o of orders.filter((o) => o.tabId === tab.id && !["served", "cancelled"].includes(o.status))) {
        await staff.post(`/api/staff/orders/${o.id}/cancel`, { data: { reason: "Automated test, please ignore" } });
      }
      await staff.post(`/api/staff/tabs/${tab.id}/close`, { data: { discountPct: 100, paymentMethod: "cash" } });
    }
    await staff.dispose();
  });

  test("guest phone numbers are masked everywhere staff look", async ({ page, playwright, baseURL }) => {
    const t = testTable();
    const guest = await playwright.request.newContext({ baseURL });
    const { phone, token } = await guestLogin(guest, staff, t, null);
    const [dish] = await orderableDishes(staff, t);
    const placed = await guest.post(`/api/t/${token}/orders`, { data: { lines: [{ menuItemId: dish.id, qty: 1 }], note: `call me on ${phone}` } });
    expect(placed.ok(), await placed.text()).toBeTruthy();
    await guest.dispose();

    // The API never sends the full number.
    const audit = await (await staff.get("/api/staff/audit?limit=200")).text();
    expect(audit, "activity log API").not.toContain(phone);
    const orders = await (await staff.get("/api/staff/orders")).text();
    expect(orders, "waiter orders API").not.toContain(phone);

    // Waiter screen: a guest with no name shows as "Guest ••••1234".
    await page.goto("/staff/waiter");
    await expect(page.getByText(`Guest ${masked(phone)}`).first()).toBeVisible();
    await expect(page.locator("main")).not.toContainText(phone);

    // Activity log: readable words, masked who, no internal keys.
    await page.goto("/staff/manager");
    await page.getByRole("tab", { name: "Activity log" }).click();
    const log = page.locator("tbody");
    const login = log.locator("tr").filter({ hasText: "signed in with a code from the waiter" }).filter({ hasText: masked(phone) });
    await expect(login).toHaveCount(1);
    await expect(log).not.toContainText(phone);
    await expect(log).not.toContainText(/\b(guest|order|tab|staff|menu|table|item)\.[a-z_]+/);
  });
});
