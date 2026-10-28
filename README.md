# Hundred Palms ordering

Table QR ordering for Hundred Palms, Mahoba. Guests scan the QR code on their table, sign in with Google or their mobile number, and order from their phone. A waiter checks every order before it reaches the kitchen, and every step is logged with who did it, so the bill always matches.

## What's in it

| Who | Where | What they do |
| --- | --- | --- |
| Guest | `/t/<table code>` (from the QR code) | Browse the menu, order, see live status, choose when an item is unavailable, ask for the bill |
| Waiter | `/staff/waiter` | Approve orders, mark items unavailable, cancel at a guest's request (with a reason), take orders in person, mark served |
| Kitchen | `/staff/kitchen` | See approved orders only, mark cooking and ready, mark dishes sold out |
| Cashier | `/staff/cashier` | See every table, open bills with who ordered and approved each item, discount, take cash, UPI or card |
| Manager | `/staff/manager` | Edit the menu and photos, add tables and print QR cards, add staff, set GST, read the activity log |

### Rules the app enforces

- No order reaches the kitchen without a waiter's approval. A waiter taking an order in person counts as approval.
- Guests can't cancel after placing an order. Only a waiter or manager can, and they must give a reason.
- If the waiter marks an item unavailable, the order goes back to the guest, who drops it. The rest returns to the waiter.
- Names and prices are copied into each order, so editing the menu never changes a bill already placed.
- A bill can't be closed while an order still waits for a waiter.
- Cashiers can give up to 20% discount; managers can give more.
- GST (default 5%) is split equally into CGST and SGST. Money is stored in paise, so there are no rounding errors.

## Run it on your computer

You need Node 20+ and Postgres 16.

```bash
cp .env.example .env.local      # then fill in SESSION_SECRET and SEED_MANAGER_PIN
npm install
npm run db:migrate              # create the tables
npm run db:seed                 # 2 restaurants, 10 tables each, a sample menu, the manager login
npm run dev
```

Open http://localhost:3000/staff/login and sign in with `SEED_MANAGER_PHONE` and `SEED_MANAGER_PIN`. Go to **Manage → Tables & QR → Print QR cards** and open any card's link to see the guest side. With `DEV_SHOW_OTP=1`, mobile login shows the code on screen instead of sending an SMS. This never happens on the live site.

## Checks

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

Tests run against a real Postgres database (`TEST_DATABASE_URL`, default `postgresql://hp:hp@localhost:5432/hundredpalms_test`), which they wipe first. GitHub Actions runs all four checks on every pull request.

## Settings

| Variable | Needed | What it does |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Postgres connection string |
| `SESSION_SECRET` | Yes | At least 32 random characters, signs login cookies |
| `APP_URL` | Yes in production | Public address, used in QR codes and Google sign-in |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | For Google sign-in | The Google button is hidden without them |
| `SMS_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | For mobile OTP | Mobile login is hidden on the live site without them |
| `BLOB_READ_WRITE_TOKEN` | For photo upload | Vercel Blob; without it, managers paste a photo link |
| `DEV_SHOW_OTP=1` | Development only | Shows the OTP on screen; ignored on the live site |

## Security

- Staff sign in with mobile number and a 4 to 6 digit PIN, hashed with scrypt. Five wrong PINs lock the account for 15 minutes.
- OTPs expire in 5 minutes, allow 5 tries, and are limited to 3 per number per 10 minutes and 10 per device per hour.
- Login cookies are signed, HTTP-only, and `SameSite=Lax`. Every write must be JSON from the same site, which blocks cross-site form attacks.
- Each staff action checks the person's role on the server, not only in the screen.
- Order changes lock the row in the database, so two waiters tapping at once can't double-approve or double-close.

## Tech

Next.js 15 (App Router), React 19, Tailwind CSS 4, Postgres with Drizzle ORM, Vitest. Screens update by polling every few seconds, which works on Vercel without extra services.
