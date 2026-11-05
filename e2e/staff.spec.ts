import { expect, test } from "@playwright/test";
import { STAFF_STATE, expectNoSidewaysScroll } from "./helpers";

test.describe("Staff sign in", () => {
  test("a wrong PIN is refused", async ({ page }) => {
    await page.goto("/staff/login");
    // A number no staff member has, so this never locks a real account.
    await page.getByLabel("Mobile number").fill("9000000000");
    await page.getByLabel("PIN").fill("0000");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: /wrong/i })).toBeVisible();
    await expect(page).toHaveURL(/\/staff\/login/);
  });

  test("staff pages need a login", async ({ page }) => {
    await page.goto("/staff/waiter");
    await expect(page).toHaveURL(/\/staff\/login/);
  });
});

test.describe("Manager screens", () => {
  test.use({ storageState: STAFF_STATE });

  const screens = [
    { path: "/staff/waiter", check: /\+ Take an order for a table/ },
    { path: "/staff/kitchen", check: /^Kitchen$/ },
    { path: "/staff/cashier", check: /^Bills$/ },
    { path: "/staff/manager", check: /^Manage$/ },
    { path: "/staff/manager/qr", check: /^Table QR cards$/ },
  ];
  for (const s of screens) {
    test(`${s.path} opens without errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(s.path);
      await expect(page.getByText(s.check).first()).toBeVisible();
      await page.waitForTimeout(1500); // let the first poll finish
      await expect(page.getByText(/Can.t reach the server/)).toHaveCount(0);
      await expectNoSidewaysScroll(page);
      expect(errors, "JavaScript errors on the page").toEqual([]);
    });
  }
});
