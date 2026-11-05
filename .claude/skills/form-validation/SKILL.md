---
name: form-validation
description: Rules every form and input in Hundred Palms must follow (Indian mobile numbers, required fields, ranges, lengths, money, double submits, error messages), plus how to audit a form, fix it and test it. Use when adding or changing any form, input or API body, and when auditing forms.
---

# Form validation

These rules come from the owner. Every form in the app follows them, on the screen **and** on the server. When you add or change a form or an API body, check it against this list, add a test for each rule it touches, and fix gaps in the same PR.

## Rules

### Indian mobile numbers
1. Accept exactly 10 national digits, starting with 6 to 9.
2. Never allow an 11th digit.
3. Open the numeric keypad on phones (`type="tel"`, `inputMode="numeric"`).
4. Refuse letters and other invalid characters **with a message**. Don't delete them quietly.
5. Pasted values work: `+91 98765 43210`, `098765-43210` and `9876543210` all become `9876543210` before the 10-digit check.
6. If `+91` is shown or typed, strip it first, then check the 10 digits.
7. The server checks again (`normalizeIndianPhone` in `src/lib/auth.ts`). Never trust the screen alone.
8. Messages say what to fix: "Enter a 10-digit mobile number", "Mobile numbers have only digits".
9. Never silently cut invalid input. Show it and explain it.

Use the shared `PhoneInput` component (`src/components/PhoneInput.tsx`) and `src/lib/phone.ts` for every phone field. Don't hand-roll a phone `<input>`.

### Every form
10. **Required fields** are enforced: `required` on the input, and the server refuses empty or whitespace-only values (`.trim()` then check).
11. **Email** (if one is ever added): `type="email"` on screen, `z.string().email()` on the server, lower-cased and trimmed.
12. **Money and counts** can't be negative: `min={0}` on screen, `.min(0)` or a domain check on the server. Whole-number fields (table number, seats, quantity, discount %) use `step={1}` and `.int()`. Prices are stored in paise, never as floats.
13. **Lengths**: `maxLength`/`minLength` on screen match the server's `z.string().max(n)` exactly. Ranges: `min`/`max` match the server.
14. **No double submits**: disable the button while sending **and** guard the handler with a `useRef` flag, because two quick taps arrive before React re-renders. The order buttons (guest cart and waiter "take an order") must place exactly one order per tap.
15. **Meaningful messages**: name the field and say what's allowed ("Seats must be a whole number from 1 to 40"). Server zod errors pass through `zodMessage()` in `src/lib/http.ts`, which names the field. Add new field names to `FIELD_LABELS` there.
16. **Keep what was typed** when showing an error. Never clear the form or reset a field because a save failed. Don't clamp a value to the nearest allowed one without saying so; show the problem and disable the action instead (see the cashier discount).
17. Mark a field in error with `aria-invalid` and point to the message with `aria-describedby`. The message has `role="alert"`, so screen readers and the tests can find it.

## Audit a form

For each form (find them with `grep -rn "<input\|<textarea\|<select\|<form" src --include=*.tsx`):

1. List each field. Note its type, `required`, `min`/`max`/`step`, `maxLength`/`minLength`, `pattern` and `inputMode`.
2. Find the API route it posts to and the zod schema plus domain checks behind it. Compare the limits one by one; the screen and server must agree.
3. Go through rules 1 to 17 and write down every gap with its file and line.
4. Check the submit handler for a double-submit guard, and check what happens to the typed values on error.
5. Look for silent changes: `.replace(/\D/g, "")` on input, `Math.min`/`Math.max` clamps, `.slice()` on user text.

## Test it

- **End-to-end** (`e2e/forms.spec.ts`): type the bad value, then assert it's refused (`el.validity.valid === false`, or a `role="alert"` message). Assert the typed value is still there and nothing was saved. Checks that would change real data if the rule broke get `test.skip(remote, ...)`, so they run on a local copy, never on the live site.
- **Unit** (`tests/`): server schemas and domain checks, e.g. `zodMessage`, `normalizeIndianPhone`, `addTable` ranges.
- Run the `checkpoint-qa` skill afterwards.

## Audit log (2026-11-05)

Fixed: GST could be saved empty as 0%; the cashier discount was silently clamped; staff PIN letters were silently stripped; a double tap on "Place order" could send two orders; server errors didn't say which field; and several missing `max`/`maxLength`/`step` limits (table number, seats, dish price, photo link, cancel reason, staff name). The phone fields are handled by the shared `PhoneInput`. No email fields exist yet.
