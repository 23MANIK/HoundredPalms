import { expect, test, type Page } from "@playwright/test";
import { testTable } from "./helpers";

/**
 * Indian mobile number fields: exactly 10 digits, number keypad, letters and an
 * 11th digit refused with a message (never silently dropped), pasted +91 or 0
 * numbers cleaned up, and the server checks the same rules.
 */

async function checkPhoneField(page: Page, field: ReturnType<Page["getByLabel"]>) {
  await expect(field, "opens the number keypad on phones").toHaveAttribute("inputmode", "numeric");
  await expect(field).toHaveAttribute("type", "tel");

  // Letters are refused with a message and the field keeps what it had.
  await field.fill("98765");
  await field.pressSequentially("a");
  await expect(field).toHaveValue("98765");
  await expect(page.getByRole("alert").filter({ hasText: "A mobile number can only have digits" })).toBeVisible();

  // An 11th digit is refused with a message, not cut off silently.
  await field.fill("9876543210");
  await field.pressSequentially("1");
  await expect(field).toHaveValue("9876543210");
  await expect(page.getByRole("alert").filter({ hasText: "A mobile number has only 10 digits" })).toBeVisible();

  // Pasted numbers with +91, 0, spaces or dashes become the 10 digits.
  for (const pasted of ["+91 98765-43210", "098765 43210", "(98765) 43210"]) {
    await field.fill(pasted);
    await expect(field, `pasting "${pasted}"`).toHaveValue("9876543210");
  }
  await expect(page.getByRole("alert").filter({ hasText: /digits/ })).toHaveCount(0);

  // Too short: a clear message once the person moves on.
  await field.fill("98765");
  await field.blur();
  await expect(page.getByRole("alert").filter({ hasText: "Enter all 10 digits (5 so far)" })).toBeVisible();

  // Must start with 6 to 9.
  await field.fill("5876543210");
  await expect(page.getByRole("alert").filter({ hasText: "start with 6, 7, 8 or 9" })).toBeVisible();
}

test.describe("Mobile number fields", () => {
  test("guest sign in takes exactly 10 digits", async ({ page }) => {
    await page.goto(testTable().path);
    await page.getByRole("button", { name: "Sign in to order" }).click();
    const field = page.getByLabel("Mobile number");
    await checkPhoneField(page, field);
    const getCode = page.getByRole("button", { name: "Get code from my waiter" });
    await expect(getCode, "can't ask for a code with a wrong number").toBeDisabled();
    await field.fill("9876543210");
    await expect(getCode).toBeEnabled();
  });

  test("staff sign in takes exactly 10 digits", async ({ page }) => {
    await page.goto("/staff/login");
    const field = page.getByLabel("Mobile number");
    await checkPhoneField(page, field);
    await page.getByLabel("PIN").fill("0000");
    await field.fill("98765");
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeDisabled();
  });

  test("the server refuses numbers the screen would refuse", async ({ request }) => {
    for (const phone of ["98765a3210", "98765432101", "98765", "5876543210"]) {
      const res = await request.post("/api/staff/login", { data: { phone, pin: "0000" } });
      expect(res.status(), `staff login with "${phone}"`).toBe(400);
      expect((await res.json()).error).toMatch(/digit|start with/);
    }
  });
});
