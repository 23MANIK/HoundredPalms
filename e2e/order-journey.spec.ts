import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { STAFF_STATE, TEST_CANCEL_REASON, TEST_GUEST, bypassHeaders, freeTable, randomPhone, testTable } from "./helpers";

/**
 * One full evening at a table, with a guest phone and a staff screen side by side:
 * sign in with the waiter's code, order, waiter marks a dish unavailable, guest
 * drops it, waiter approves, kitchen cooks, waiter serves, a second order is
 * cancelled at the guest's request, guest asks for the bill, cashier closes it,
 * the guest is signed out, and the activity log shows who did what.
 */

const table = () => testTable();

async function staffContext(browser: Browser, info: TestInfo): Promise<BrowserContext> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { defaultBrowserType, ...device } = info.project.use;
  return browser.newContext({ ...device, storageState: STAFF_STATE });
}

const rupees = (s: string | null) => Number((s ?? "").replace(/[^\d.]/g, ""));

async function addDish(guest: Page, skip: string[] = []) {
  const buttons = guest.getByRole("button", { name: /^Add (?!one more )/ });
  for (const b of await buttons.all()) {
    const name = (await b.getAttribute("aria-label"))!.replace(/^Add /, "");
    if (skip.includes(name)) continue;
    await b.click();
    return name;
  }
  throw new Error("No dish left to add");
}

async function newestOrderId(guest: Page) {
  const text = await guest.getByText(/^Order #\d+/).first().textContent();
  return Number(text!.match(/#(\d+)/)![1]);
}

test.describe("Full order journey", () => {
  test.beforeEach(async ({ playwright, baseURL }) => {
    const api = await playwright.request.newContext({ baseURL, storageState: STAFF_STATE, extraHTTPHeaders: bypassHeaders() });
    const free = await freeTable(api, table());
    await api.dispose();
    test.skip(!free, `${table().restaurant} table ${table().number} has a real guest's order open, so the test leaves it alone`);
  });

  test.afterEach(async ({ playwright, baseURL }) => {
    const api = await playwright.request.newContext({ baseURL, storageState: STAFF_STATE, extraHTTPHeaders: bypassHeaders() });
    await freeTable(api, table());
    await api.dispose();
  });

  test("guest orders, waiter approves, kitchen cooks, cashier bills", async ({ page: guest, browser }, info) => {
    const t = table();
    const phone = randomPhone();
    const staffCtx = await staffContext(browser, info);
    const staff = await staffCtx.newPage();
    const waiterCard = (orderId: number) => staff.locator("article").filter({ hasText: `#${orderId} ·` });

    let dishA = "";
    let dishB = "";
    let orderId = 0;

    await test.step("guest scans the QR and fills the cart", async () => {
      await guest.goto(t.path);
      dishA = await addDish(guest);
      dishB = await addDish(guest, [dishA]);
      await guest.getByRole("button", { name: /2 items.*View cart/ }).click();
      await guest.getByLabel("Cooking instructions (optional)").fill("E2E test, less spicy");
      await guest.getByRole("button", { name: "Sign in to place order" }).click();
    });

    await test.step("guest asks the waiter for a login code", async () => {
      await guest.getByLabel("Mobile number").fill(phone);
      await guest.getByRole("button", { name: "Get code from my waiter" }).click();
      await expect(guest.getByText("Your waiter has your code")).toBeVisible();
    });

    await test.step("waiter sees the code for that table and number", async () => {
      await staff.goto("/staff/waiter");
      const codeCard = staff
        .getByRole("region", { name: /Guests waiting for a login code/ })
        .getByRole("listitem")
        .filter({ hasText: `Table ${t.number}` })
        .filter({ hasText: t.restaurant })
        .filter({ hasText: `Number ends ${phone.slice(-4)}` });
      await expect(codeCard).toBeVisible();
      const code = (await codeCard.locator(".font-mono").textContent())!.trim();
      expect(code).toMatch(/^\d{6}$/);

      await guest.getByLabel(/Enter the 6-digit code/).fill(code);
      await guest.getByRole("button", { name: "Verify and continue" }).click();
      await guest.getByLabel("What should we call you?").fill(TEST_GUEST);
      await guest.getByRole("button", { name: "Continue" }).click();
      await expect(codeCard, "used code disappears from the waiter screen").toHaveCount(0);
    });

    await test.step("guest places the order", async () => {
      await guest.getByRole("button", { name: /^Place order · ₹/ }).click();
      await expect(guest.getByRole("heading", { name: "My orders" })).toBeVisible();
      await expect(guest.getByText("Waiting for your waiter to confirm")).toBeVisible();
      orderId = await newestOrderId(guest);
    });

    await test.step("waiter marks one dish unavailable and sends it back", async () => {
      const card = waiterCard(orderId);
      await expect(card).toBeVisible();
      await expect(card).toContainText(TEST_GUEST);
      await expect(card).toContainText("Needs approval");
      await expect(card).toContainText("E2E test, less spicy");
      await card.getByRole("listitem").filter({ hasText: dishB }).getByRole("button", { name: "In stock" }).click();
      await card.getByRole("button", { name: "Send back to guest (1 unavailable)" }).click();
      await expect(card).toContainText("Guest choosing");
    });

    await test.step("guest drops the unavailable dish", async () => {
      await expect(guest.getByText("One or more items need your choice")).toBeVisible();
      await expect(guest.getByText(`${dishB} is not available right now`)).toBeVisible();
      await guest.getByRole("button", { name: "Remove and send" }).click();
      await expect(guest.getByText("Waiting for your waiter to confirm")).toBeVisible();
    });

    await test.step("waiter approves and it goes to the kitchen", async () => {
      const card = waiterCard(orderId);
      await expect(card).toContainText("Needs approval");
      await expect(card).toContainText("guest removed");
      await card.getByRole("button", { name: "Approve · send to kitchen" }).click();
      await expect(guest.getByText(/^Approved/)).toBeVisible();
    });

    await test.step("kitchen cooks it and marks it ready", async () => {
      await staff.goto("/staff/kitchen");
      const ticket = staff.locator("article").filter({ hasText: `T${t.number}` }).filter({ hasText: t.restaurant }).filter({ hasText: dishA });
      await expect(ticket).not.toContainText(dishB);
      await ticket.getByRole("button", { name: "Start cooking" }).click();
      await expect(guest.getByText("The kitchen is cooking")).toBeVisible();
      await ticket.getByRole("button", { name: "Ready" }).click();
      await expect(guest.getByText("Ready, coming to your table")).toBeVisible();
    });

    await test.step("waiter serves it", async () => {
      await staff.goto("/staff/waiter");
      await staff.getByRole("tab", { name: /^Kitchen/ }).click();
      const card = waiterCard(orderId);
      await expect(card).toContainText("Ready to serve");
      await card.getByRole("button", { name: "Mark served" }).click();
      await expect(guest.getByText("Served. Enjoy your meal!")).toBeVisible();
    });

    let secondId = 0;
    await test.step("guest orders again and the waiter cancels it at their request", async () => {
      await guest.getByRole("button", { name: "Order more" }).click();
      await addDish(guest, [dishA, dishB]);
      await guest.getByRole("button", { name: /1 item.*View cart/ }).click();
      // A double tap must place one order, not two.
      await guest.getByRole("button", { name: /^Place order · ₹/ }).dblclick();
      await expect(guest.getByText("Waiting for your waiter to confirm")).toBeVisible();
      secondId = await newestOrderId(guest);
      expect(secondId).toBeGreaterThan(orderId);
      await expect(guest.getByText(/^Order #\d+/), "one order per tap, even on a double tap").toHaveCount(2);

      await staff.getByRole("tab", { name: /^New/ }).click();
      const card = waiterCard(secondId);
      await card.getByRole("button", { name: "Cancel order (guest asked)" }).click();
      await expect(card.getByLabel("Why is this order being cancelled?")).toHaveAttribute("maxlength", "200");
      await card.getByLabel("Why is this order being cancelled?").fill(TEST_CANCEL_REASON);
      await card.getByRole("button", { name: "Cancel order", exact: true }).click();
      await expect(guest.getByText("This order was cancelled")).toBeVisible();
      await expect(guest.getByText(`Reason: ${TEST_CANCEL_REASON}`)).toBeVisible();
    });

    let guestTotal = 0;
    await test.step("guest asks for the bill", async () => {
      const bill = guest.locator("section").filter({ hasText: "Table bill so far" });
      guestTotal = rupees(await bill.locator("span.text-xl").textContent());
      expect(guestTotal).toBeGreaterThan(0);
      await bill.getByRole("button", { name: "Ask for the bill" }).click();
      await expect(guest.getByText("The cashier knows you'd like the bill")).toBeVisible();
    });

    await test.step("cashier sees who ordered and approved, and closes the bill", async () => {
      await staff.goto("/staff/cashier");
      await staff.getByRole("button", { name: `${t.restaurant} table ${t.number}, bill asked` }).click();
      const bill = staff.getByRole("region", { name: `Bill for table ${t.number}` });
      await expect(bill).toContainText(`Ordered by ${TEST_GUEST}`);
      await expect(bill).toContainText("approved by");
      await expect(bill).toContainText("Removed (unavailable)");
      await expect(bill).toContainText(`Cancelled by`);
      const total = bill.getByText("Total", { exact: true }).locator("xpath=following-sibling::span");
      expect(rupees(await total.textContent()), "cashier total matches the guest's bill").toBeCloseTo(guestTotal, 2);

      // A bad discount is explained, not quietly changed.
      const discount = bill.getByLabel(/^Discount/);
      await discount.fill("12.5");
      await expect(bill.getByRole("alert").filter({ hasText: "whole number" })).toBeVisible();
      await expect(discount).toHaveValue("12.5");
      await bill.getByRole("radio", { name: "cash" }).click();
      await expect(bill.getByRole("button", { name: "Mark paid by CASH · close table" })).toBeDisabled();

      // 100% discount so test runs never count as sales.
      await discount.fill("100");
      await expect(total).toHaveText("₹0");
      await bill.getByRole("button", { name: "Mark paid by CASH · close table" }).click();
      await expect(staff.getByText(`Table ${t.number} paid`)).toBeVisible();
    });

    await test.step("guest is signed out once the bill is paid", async () => {
      await expect(guest.getByText("Your bill is paid. Thank you for dining with us!")).toBeVisible();
      await expect(guest.getByRole("button", { name: "Sign in to order" })).toBeVisible();
      // Still signed out after a reload: the old login no longer works.
      await guest.reload();
      await expect(guest.getByRole("button", { name: "Sign in to order" })).toBeVisible();
      const res = await guest.request.get(`/api/t/${t.path.split("/").pop()}/orders`);
      expect(res.status(), "old login is refused by the server").toBe(401);
    });

    await test.step("activity log records who did what", async () => {
      await staff.goto("/staff/manager");
      await staff.getByRole("tab", { name: "Activity log" }).click();
      const log = staff.locator("tbody");
      const row = (what: string, id: number) =>
        log.locator("tr").filter({ has: staff.locator("td", { hasText: new RegExp(`^${what} #${id}$`) }) });
      await expect(row("placed an order", orderId)).toContainText(TEST_GUEST);
      await expect(row("approved an order", orderId)).toHaveCount(1);
      await expect(row("served", orderId)).toHaveCount(1);
      await expect(row("cancelled an order", secondId)).toContainText(TEST_CANCEL_REASON);
      await expect(log.locator("tr").filter({ hasText: "closed a bill" }).first()).toBeVisible();
    });

    await staffCtx.close();
  });
});
