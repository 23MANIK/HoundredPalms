import { expect, type APIRequestContext, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

export const STATE_DIR = path.join(__dirname, ".state");
export const STAFF_STATE = path.join(STATE_DIR, "staff.json");
export const TABLES_FILE = path.join(STATE_DIR, "tables.json");

/** Name the test guest uses, so test orders are easy to spot in the activity log. */
export const TEST_GUEST = "E2E Test Guest";
export const TEST_CANCEL_REASON = "Automated test, please ignore";

/** Header that lets the checks past Vercel's login wall on preview deployments. */
export function bypassHeaders(): Record<string, string> {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  return secret ? { "x-vercel-protection-bypass": secret, "x-vercel-set-bypass-cookie": "true" } : {};
}

export type TableLink = { restaurant: string; number: number; path: string };

export function staffLogin() {
  const remote = !!process.env.E2E_BASE_URL;
  const phone = process.env.E2E_STAFF_PHONE ?? (remote ? "" : process.env.SEED_MANAGER_PHONE ?? "9999999999");
  const pin = process.env.E2E_STAFF_PIN ?? (remote ? "" : process.env.SEED_MANAGER_PIN ?? "");
  if (!phone || !pin) {
    throw new Error("Set E2E_STAFF_PHONE and E2E_STAFF_PIN to a manager login (or SEED_MANAGER_PIN when testing locally)");
  }
  return { phone, pin };
}

export function tables(): TableLink[] {
  return JSON.parse(fs.readFileSync(TABLES_FILE, "utf8"));
}

/**
 * The table the tests order at: the highest-numbered table of the restaurant
 * that serves both veg and non-veg (falls back to the last table listed).
 */
export function testTable(opts: { vegOnly?: boolean } = {}): TableLink {
  const all = tables();
  const want = all.filter((t) => (opts.vegOnly ? /ground floor/i.test(t.restaurant) : !/ground floor/i.test(t.restaurant)));
  const list = want.length ? want : all;
  return [...list].sort((a, b) => a.number - b.number).at(-1)!;
}

/** A random valid Indian mobile number, so the per-number OTP limit never trips. */
export function randomPhone() {
  return `90${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
}

/** Fails the test if the page is wider than the screen (sideways scrolling on a phone). */
export async function expectNoSidewaysScroll(page: Page) {
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(scroll, "page should not scroll sideways").toBeLessThanOrEqual(client + 1);
}

/** Fails the test if any dish photo that has scrolled into view failed to load. */
export async function expectPhotosLoaded(page: Page) {
  const broken = await page.evaluate(async () => {
    const imgs = [...document.querySelectorAll("img")].filter((i) => i.getBoundingClientRect().top < innerHeight);
    await Promise.all(
      imgs.map((i) =>
        i.complete ? null : new Promise((done) => {
          i.addEventListener("load", done, { once: true });
          i.addEventListener("error", done, { once: true });
        }),
      ),
    );
    return imgs.filter((i) => i.naturalWidth === 0).map((i) => i.alt || i.src);
  });
  expect(broken, "dish photos that failed to load").toEqual([]);
}

/**
 * Leaves the test table free: cancels anything a waiter still has to act on
 * and closes its bill at 100% discount, so test runs never add to sales.
 * Returns false, and touches nothing, if a real guest has ordered there.
 */
export async function freeTable(api: APIRequestContext, t: TableLink): Promise<boolean> {
  const res = await api.get("/api/staff/tables");
  expect(res.ok(), "reading tables").toBeTruthy();
  const { tables: rows } = (await res.json()) as {
    tables: { id: number; number: number; restaurant: { name: string }; tab: { id: number } | null }[];
  };
  const row = rows.find((r) => r.number === t.number && r.restaurant.name === t.restaurant);
  if (!row?.tab) return true;
  const tabId = row.tab.id;
  const ordersRes = await api.get("/api/staff/orders");
  const { orders } = (await ordersRes.json()) as { orders: { id: number; tabId: number; status: string; guest: string }[] };
  const onTab = orders.filter((o) => o.tabId === tabId);
  if (onTab.some((o) => o.guest !== TEST_GUEST)) return false;
  for (const o of onTab.filter((o) => !["served", "cancelled"].includes(o.status))) {
    await api.post(`/api/staff/orders/${o.id}/cancel`, { data: { reason: TEST_CANCEL_REASON } });
  }
  const close = await api.post(`/api/staff/tabs/${tabId}/close`, { data: { discountPct: 100, paymentMethod: "cash" } });
  expect(close.ok(), `closing the test table's bill: ${await close.text()}`).toBeTruthy();
  return true;
}
