import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { ROLE_STATE, STAFF_STATE, bypassHeaders, freeTable, guestLogin, isRemote, orderableDishes, tables, testTable } from "./helpers";

/**
 * Manage → Tables & QR. The user-testing report found this tab showed no
 * tables at all, so these check every table is listed with its menu link,
 * that a load failure says so, and that a new QR code really retires the old
 * one. The read-only checks also run against the live site.
 */

type ApiTable = { id: number; number: number; seats: number; restaurant: { id: number; name: string }; qrPath?: string; tab: unknown };

async function openTablesTab(page: Page) {
  await page.goto("/staff/manager");
  await page.getByRole("tab", { name: "Tables & QR" }).click();
}

test.describe("Tables & QR", () => {
  test.use({ storageState: STAFF_STATE });

  test("every table is listed with its menu link", async ({ page }) => {
    await openTablesTab(page);
    const cards = page.getByTestId("table-card");
    await expect(cards.first()).toBeVisible();
    const count = await cards.count();
    await expect(page.getByText(`${count} active ${count === 1 ? "table" : "tables"}.`)).toBeVisible();
    expect(count, "the same tables as the printed QR cards").toBe(tables().length);

    // Each restaurant's heading counts its own cards.
    const byRestaurant = new Map<string, number>();
    for (const t of tables()) byRestaurant.set(t.restaurant, (byRestaurant.get(t.restaurant) ?? 0) + 1);
    for (const [name, n] of byRestaurant) {
      const section = page.getByRole("region", { name: `${name} tables` });
      await expect(section.getByTestId("table-card")).toHaveCount(n);
      await expect(section.getByRole("heading")).toContainText(`· ${n} ${n === 1 ? "table" : "tables"}`);
    }

    // Each card shows a status, its seats and the same link as the QR card.
    for (const t of tables()) {
      const card = page.getByRole("region", { name: `${t.restaurant} tables` }).getByRole("listitem", { name: `Table ${t.number}`, exact: true });
      await expect(card.getByText(/^(Free|Bill open · ₹.*|Bill asked · ₹.*)$/)).toBeVisible();
      await expect(card.getByLabel(`Seats at table ${t.number}`)).toBeVisible();
      const link = card.getByRole("link", { name: `Open table ${t.number} menu link` });
      await expect(link).toHaveAttribute("href", t.path);
      await expect(link).toHaveText(`Menu link: ${t.path}`);
    }
  });

  test("a failed load says so and can be retried", async ({ page }) => {
    let fail = true;
    await page.route("**/api/staff/tables", (route) =>
      fail ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Server busy" }) }) : route.continue(),
    );
    await openTablesTab(page);
    await expect(page.getByText(/Couldn.t load the tables/)).toBeVisible();
    await expect(page.getByTestId("table-card")).toHaveCount(0);
    fail = false;
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByTestId("table-card").first()).toBeVisible();
    await expect(page.getByText(/Couldn.t load the tables/)).toHaveCount(0);
  });

  test("only managers get the QR links from the server", async ({ playwright, baseURL }) => {
    const manager = await playwright.request.newContext({ baseURL, storageState: STAFF_STATE, extraHTTPHeaders: bypassHeaders() });
    const { tables: rows } = (await (await manager.get("/api/staff/tables")).json()) as { tables: ApiTable[] };
    expect(rows.length).toBe(tables().length);
    for (const r of rows) expect(r.qrPath, `table ${r.number}`).toMatch(/^\/t\/[\w-]+$/);
    await manager.dispose();

    test.skip(isRemote(), "the waiter login only exists on a local copy");
    const waiter = await playwright.request.newContext({ baseURL, storageState: ROLE_STATE("waiter") });
    const res = await waiter.get("/api/staff/tables");
    expect(res.ok()).toBeTruthy();
    const seen = (await res.json()) as { tables: ApiTable[] };
    expect(seen.tables.length).toBeGreaterThan(0);
    for (const r of seen.tables) expect(r.qrPath, "waiters don't need the QR token").toBeUndefined();
    expect((await waiter.patch(`/api/staff/tables/${seen.tables[0].id}`, { data: { regenerateQr: true } })).status()).toBe(403);
    await waiter.dispose();
  });
});

test.describe("Tables & QR changes", () => {
  test.skip(isRemote(), "changes tables and QR codes, so it runs on a local copy");
  test.use({ storageState: STAFF_STATE });

  let staff: APIRequestContext;
  test.beforeEach(async ({ playwright, baseURL }) => {
    staff = await playwright.request.newContext({ baseURL, storageState: STAFF_STATE, extraHTTPHeaders: bypassHeaders() });
  });
  test.afterEach(async () => {
    await staff.dispose();
  });

  /** A throwaway table, so the real tables' printed QR codes never change. */
  async function addScratchTable() {
    const { tables: rows } = (await (await staff.get("/api/staff/tables")).json()) as { tables: ApiTable[] };
    const restaurant = rows[0].restaurant;
    const taken = new Set(rows.filter((r) => r.restaurant.id === restaurant.id).map((r) => r.number));
    for (let n = 900 + Math.floor(Math.random() * 90); n < 999; n++) {
      if (taken.has(n)) continue;
      const res = await staff.post("/api/staff/tables", { data: { restaurantId: restaurant.id, number: n, seats: 2 } });
      if (res.ok()) {
        const { id } = (await res.json()) as { id: number };
        return { id, number: n, restaurant: restaurant.name };
      }
    }
    throw new Error("no free table number for a scratch table");
  }

  test("a new QR code retires the old link", async ({ page }) => {
    const t = await addScratchTable();
    try {
      await openTablesTab(page);
      const card = page.getByRole("region", { name: `${t.restaurant} tables` }).getByRole("listitem", { name: `Table ${t.number}`, exact: true });
      const link = card.getByRole("link", { name: `Open table ${t.number} menu link` });
      const oldPath = (await link.getAttribute("href"))!;
      expect((await page.request.get(oldPath)).status()).toBe(200);

      // Cancelling the question changes nothing.
      page.once("dialog", (d) => d.dismiss());
      await card.getByRole("button", { name: "New QR code" }).click();
      await expect(link).toHaveAttribute("href", oldPath);

      page.once("dialog", (d) => d.accept());
      await card.getByRole("button", { name: "New QR code" }).click();
      await expect(page.getByText(`Table ${t.number} has a new QR code. Print its card from "Print QR cards".`)).toBeVisible();
      await expect(link).not.toHaveAttribute("href", oldPath);
      const newPath = (await link.getAttribute("href"))!;
      expect(newPath).toMatch(/^\/t\/[\w-]+$/);
      expect((await page.request.get(oldPath)).status(), "the old printed card stops working").toBe(404);
      expect((await page.request.get(newPath)).status()).toBe(200);

      // The activity log says it in plain words.
      await page.getByRole("tab", { name: /Activity/ }).click();
      await expect(page.getByText("gave a table a new QR code").first()).toBeVisible();
      await expect(page.getByText("table.qr_regenerated")).toHaveCount(0);
    } finally {
      await staff.patch(`/api/staff/tables/${t.id}`, { data: { active: false } });
    }
  });

  test("a table with an open bill keeps its QR code", async ({ page, playwright, baseURL }) => {
    const t = testTable();
    expect(await freeTable(staff, t)).toBe(true);
    const guest = await playwright.request.newContext({ baseURL });
    try {
      const { token } = await guestLogin(guest, staff, t);
      const [dish] = await orderableDishes(staff, t);
      expect((await guest.post(`/api/t/${token}/orders`, { data: { lines: [{ menuItemId: dish.id, qty: 1 }] } })).ok()).toBeTruthy();

      await openTablesTab(page);
      const card = page.getByRole("region", { name: `${t.restaurant} tables` }).getByRole("listitem", { name: `Table ${t.number}`, exact: true });
      await expect(card.getByText(/^Bill (open|asked) · ₹/)).toBeVisible();
      await expect(card.getByRole("button", { name: "New QR code" })).toBeDisabled();
      await expect(card.getByRole("button", { name: "Remove" })).toBeDisabled();
      await expect(card.getByText("Close the open bill before changing the QR code or removing this table.")).toBeVisible();

      // The server refuses too, so a stale screen can't strand the guests.
      const { tables: rows } = (await (await staff.get("/api/staff/tables")).json()) as { tables: ApiTable[] };
      const row = rows.find((r) => r.restaurant.name === t.restaurant && r.number === t.number)!;
      const regen = await staff.patch(`/api/staff/tables/${row.id}`, { data: { regenerateQr: true } });
      expect(regen.status()).toBe(400);
      expect(await regen.text()).toMatch(/open bill/i);
      expect((await staff.patch(`/api/staff/tables/${row.id}`, { data: { active: false } })).status()).toBe(400);
      expect((await guest.get(t.path)).status(), "the guests' link still works").toBe(200);
    } finally {
      await guest.dispose();
      await freeTable(staff, t);
    }
  });
});
