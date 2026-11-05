import { expect, test } from "@playwright/test";
import { STAFF_STATE, isRemote } from "./helpers";

/**
 * Staff logins: no easy PINs, and a manager can reset someone's PIN, which
 * stops the old PIN working. Adds and changes staff logins, so local only.
 */

test.describe("Staff PINs", () => {
  test.skip(isRemote(), "adds and changes staff logins, so it runs on a local copy");
  test.use({ storageState: STAFF_STATE });

  test("an easy PIN is refused with a message", async ({ page }) => {
    await page.goto("/staff/manager");
    await page.getByRole("tab", { name: "Staff" }).click();
    await page.getByLabel("Name", { exact: true }).fill("E2E Easy Pin");
    await page.getByLabel("Mobile number").fill("9123456780");
    for (const easy of ["1234", "1111", "4321", "123456"]) {
      await page.getByLabel("PIN (4 to 6 digits)").fill(easy);
      await expect(page.getByRole("alert").filter({ hasText: /too easy/i }), `PIN ${easy}`).toBeVisible();
    }
  });

  test("the server refuses an easy PIN too", async ({ request }) => {
    const res = await request.post("/api/staff/team", { data: { name: "E2E Easy Pin", phone: "9123456781", role: "waiter", pin: "1234" } });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/too easy/i);
  });

  test("a reset PIN works and the old one stops working", async ({ page, playwright, baseURL }) => {
    const phone = `93${String(Date.now()).slice(-8)}`;
    const add = await page.request.post("/api/staff/team", { data: { name: `E2E Reset ${phone.slice(-4)}`, phone, role: "waiter", pin: "5829" } });
    expect(add.ok(), await add.text()).toBeTruthy();

    // The waiter is signed in somewhere with the old PIN.
    const waiter = await playwright.request.newContext({ baseURL });
    expect((await waiter.post("/api/staff/login", { data: { phone, pin: "5829" } })).ok()).toBeTruthy();
    expect((await waiter.get("/api/staff/orders")).ok()).toBeTruthy();

    await page.goto("/staff/manager");
    await page.getByRole("tab", { name: "Staff" }).click();
    const row = page.getByRole("listitem").filter({ hasText: `E2E Reset ${phone.slice(-4)}` });
    await row.getByRole("button", { name: "New PIN" }).click();
    await page.getByLabel(/New PIN for E2E Reset/).fill("7316");
    await page.getByRole("button", { name: "Save PIN" }).click();

    // The old session is signed out, the old PIN fails, the new one works.
    await expect.poll(async () => (await waiter.get("/api/staff/orders")).status()).toBe(401);
    expect((await waiter.post("/api/staff/login", { data: { phone, pin: "5829" } })).ok(), "old PIN").toBeFalsy();
    expect((await waiter.post("/api/staff/login", { data: { phone, pin: "7316" } })).ok(), "new PIN").toBeTruthy();
    await waiter.dispose();
  });
});
