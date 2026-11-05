import { expect, test, type Locator } from "@playwright/test";
import { STAFF_STATE } from "./helpers";

/**
 * Form rules from .claude/skills/form-validation/SKILL.md. Each check types bad
 * input and makes sure it is refused with a clear message, without saving.
 * Checks that would change real data if the rule broke run only on a local copy.
 */

const remote = !!process.env.E2E_BASE_URL;
const valid = (l: Locator) => l.evaluate((el: HTMLInputElement) => el.validity.valid);

test.describe("Form rules (manager screens)", () => {
  test.use({ storageState: STAFF_STATE });

  test("the server names the field that is wrong", async ({ request }) => {
    const res = await request.post("/api/staff/settings", { data: { gstPercent: "five" } });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe("GST is missing or not valid");
  });

  test("GST can't be saved empty or out of range", async ({ page }) => {
    test.skip(remote, "could change the live GST rate if the rule broke");
    await page.goto("/staff/manager");
    await page.getByRole("tab", { name: "GST" }).click();
    const gst = page.getByLabel("GST on food (%)");
    const before = await gst.inputValue();
    for (const bad of ["", "-1", "29"]) {
      await gst.fill(bad);
      await page.getByRole("button", { name: "Save" }).click();
      expect(await valid(gst), `GST "${bad}" should be refused`).toBe(false);
      await expect(page.getByText("Saved. New bills use this rate.")).toHaveCount(0);
    }
    await page.reload();
    await page.getByRole("tab", { name: "GST" }).click();
    await expect(page.getByLabel("GST on food (%)")).toHaveValue(before);
  });

  test("new staff PIN refuses letters with a message, not silently", async ({ page }) => {
    test.skip(remote, "could add a staff login on the live site if the rule broke");
    await page.goto("/staff/manager");
    await page.getByRole("tab", { name: "Staff" }).click();
    const pin = page.getByLabel("PIN (4 to 6 digits)");
    await pin.fill("12a4");
    await expect(pin, "what was typed stays visible").toHaveValue("12a4");
    await expect(page.getByRole("alert").filter({ hasText: "PIN can only have digits" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add staff" })).toBeDisabled();
    await pin.fill("12");
    expect(await valid(pin), "PIN shorter than 4 is refused").toBe(false);
    await expect(page.getByLabel("Name", { exact: true })).toHaveAttribute("maxlength", "60");
  });

  test("table number and seats stay in range", async ({ page }) => {
    test.skip(remote, "could add or change a live table if the rule broke");
    await page.goto("/staff/manager");
    await page.getByRole("tab", { name: "Tables & QR" }).click();
    const number = page.getByLabel("Table number");
    for (const bad of ["0", "1000", "2.5"]) {
      await number.fill(bad);
      expect(await valid(number), `table number ${bad} should be refused`).toBe(false);
    }
    const seats = page.getByLabel("Seats at table 1").first();
    const before = await seats.inputValue();
    await seats.fill("0");
    await seats.blur();
    await expect(page.getByRole("alert").filter({ hasText: "seats must be a whole number from 1 to 40" })).toBeVisible();
    await expect(seats, "the old value comes back").toHaveValue(before);
  });

  test("dish price can't be negative and photo links must be https", async ({ page }) => {
    await page.goto("/staff/manager");
    await page.getByRole("button", { name: "+ Add dish" }).click();
    const price = page.getByLabel("Price (₹, before GST)");
    await price.fill("-5");
    expect(await valid(price), "negative price refused").toBe(false);
    await price.fill("100001");
    expect(await valid(price), "price over ₹1,00,000 refused").toBe(false);
    const link = page.getByLabel("Photo link");
    await link.fill("http://example.com/dish.jpg");
    expect(await valid(link), "http link refused").toBe(false);
    await link.fill("https://example.com/dish.jpg");
    expect(await valid(link)).toBe(true);
    await page.getByRole("button", { name: "Cancel" }).click();
  });
});
