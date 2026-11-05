import { expect, test } from "@playwright/test";
import { expectNoSidewaysScroll, expectPhotosLoaded, testTable } from "./helpers";

const rupees = (s: string | null) => Number((s ?? "").replace(/[^\d.]/g, ""));
const addButtons = (page: import("@playwright/test").Page) => page.getByRole("button", { name: /^Add (?!one more )/ });

test.describe("Guest menu (after scanning the table QR)", () => {
  test("menu opens for the right table and looks right", async ({ page }) => {
    const t = testTable();
    await page.goto(t.path);
    await expect(page.getByRole("heading", { level: 1, name: t.restaurant })).toBeVisible();
    await expect(page.getByText(`Table ${t.number}`, { exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Menu sections" }).getByRole("button").first()).toBeVisible();
    expect(await addButtons(page).count(), "dishes with an ADD button").toBeGreaterThan(5);
    await expect(page.getByRole("button", { name: "Sign in to order" })).toBeVisible();
    await expectNoSidewaysScroll(page);
    await expectPhotosLoaded(page);
  });

  test("search finds a dish and says so when nothing matches", async ({ page }) => {
    await page.goto(testTable().path);
    const firstDish = (await page.locator("main li h3").first().textContent())!.trim();
    const search = page.getByPlaceholder("Search dishes");
    await search.fill(firstDish);
    await expect(page.locator("main li h3").first()).toHaveText(firstDish);
    await search.fill("zzzz no such dish");
    await expect(page.getByText("No dishes match your search.")).toBeVisible();
  });

  test("veg only hides non-veg dishes", async ({ page }) => {
    await page.goto(testTable().path);
    const nonVeg = page.locator("main li").getByRole("img", { name: "Non-vegetarian" });
    test.skip((await nonVeg.count()) === 0, "this restaurant has no non-veg dishes");
    await page.getByRole("button", { name: "Veg only" }).click();
    await expect(nonVeg).toHaveCount(0);
  });

  test("pure veg restaurant shows no non-veg dishes", async ({ page }) => {
    const t = testTable({ vegOnly: true });
    await page.goto(t.path);
    await expect(page.getByText("Pure veg", { exact: true })).toBeVisible();
    await expect(page.getByRole("img", { name: "Non-vegetarian" })).toHaveCount(0);
  });

  test("cart adds up and asks the guest to sign in", async ({ page }) => {
    await page.goto(testTable().path);
    const add = addButtons(page).first();
    const dish = (await add.getAttribute("aria-label"))!.replace(/^Add /, "");
    await add.click();
    await expect(page.getByRole("button", { name: /1 item.*View cart/ })).toBeVisible();
    await page.getByRole("button", { name: `Add one more ${dish}` }).first().click();
    await page.getByRole("button", { name: /2 items.*View cart/ }).click();

    await expect(page.getByRole("heading", { name: "Your order" })).toBeVisible();
    const each = rupees(await page.getByText(/ each$/).first().textContent());
    const itemTotal = page.getByText("Item total").locator("xpath=following-sibling::span");
    expect(rupees(await itemTotal.textContent())).toBeCloseTo(each * 2, 2);
    await expect(page.getByRole("button", { name: "Sign in to place order" })).toBeVisible();
    await expectNoSidewaysScroll(page);

    // The cart survives a reload.
    await page.reload();
    await expect(page.getByRole("button", { name: /2 items.*View cart/ })).toBeVisible();
  });

  test("an unknown QR code shows a helpful page", async ({ page }) => {
    await page.goto("/t/not-a-real-table-code");
    await expect(page.getByRole("heading", { name: "We couldn't find that table" })).toBeVisible();
  });
});
