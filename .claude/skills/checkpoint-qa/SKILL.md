---
name: checkpoint-qa
description: Run the full Hundred Palms checkpoint test (lint, types, unit tests, build, end-to-end on phone and laptop, optionally the live site) and report PASS/FAIL. Use after finishing a feature, before calling a PR ready, or after a deploy.
---

# Checkpoint QA

Run this at every checkpoint: a feature finished, a PR about to be called ready, or a deploy done. It tests the app the way a guest and the staff use it. It reports; it does not fix code.

## 1. Fast checks

```bash
npm ci
npm run lint && npm run typecheck && npm test
```

Unit tests need Postgres at `TEST_DATABASE_URL` (default `postgresql://hp:hp@localhost:5432/hundredpalms_test`).

## 2. Local end-to-end run

Start Postgres if it is not running (`service postgresql start`), then create the role and databases if they are missing:

```bash
su postgres -c "psql -tc \"select 1 from pg_roles where rolname='hp'\" | grep -q 1 || psql -c \"create user hp with password 'hp' superuser\""
su postgres -c "createdb -O hp hundredpalms_e2e" 2>/dev/null || true
su postgres -c "createdb -O hp hundredpalms_test" 2>/dev/null || true
npx playwright install chromium 2>/dev/null || true   # skip if Chromium is preinstalled
```

Then build and run:

```bash
export DATABASE_URL=postgresql://hp:hp@localhost:5432/hundredpalms_e2e
export SESSION_SECRET=local-e2e-secret-local-e2e-secret-123
export SEED_MANAGER_PHONE=9999999999 SEED_MANAGER_PIN=1234
npm run db:migrate && npm run db:seed && npm run build
psql "$DATABASE_URL" -c "delete from otp_codes"   # the app allows 10 login codes per device per hour
npm run e2e
```

The run takes about 2 minutes. There are 14 checks, each run on a Pixel 7 phone size and a 1366×768 laptop size, so 28 in all.

## Batching several PRs

The end-to-end run is slow. When several PRs are in flight and nothing is urgent, test them together once:

```bash
git fetch origin
git checkout -B e2e/batch origin/main
git merge --no-edit origin/<branch-1> origin/<branch-2>   # resolve conflicts if any
```

Then run steps 1 and 2 on `e2e/batch`, or push it and start CI from Actions with **Run workflow**, choosing the `e2e/batch` branch. In CI, PRs skip the end-to-end job unless they carry the `run-e2e` label; it always runs on `main`. Report one result for the batch and name every PR in it. Delete the batch branch afterwards. If a check fails, find which PR caused it before reporting.

## 3. Live site (when asked, or after a deploy)

The cloud sandbox cannot reach `hundred-palms.vercel.app`. To run against the live site, start the **Live site check** workflow in GitHub Actions (it runs on its own after each deploy and at 10:30 IST every day). It uses the `E2E_STAFF_PHONE` and `E2E_STAFF_PIN` repository secrets. From a machine that can reach the site:

```bash
E2E_STAFF_PHONE=... E2E_STAFF_PIN=... npm run e2e:live
```

Never print the PIN. The live run orders on the highest-numbered Good Life table as "E2E Test Guest", closes the bill at 100% discount, and skips that test if a real guest has an open bill there.

## 4. Read failures

For each failed test, read `test-results/<test>/error-context.md` first: it has the error and a text snapshot of the page, which is usually enough.

**Screenshots and images:** never look at them in the main session. When a screenshot (`test-results/**/test-failed-*.png`) is needed, or when checking how a screen looks, spawn a subagent with `model: "haiku"` that reads the image files and describes what is on screen and what looks wrong. Use its description in the report.

## 5. Look for gaps

Read what changed since the last checkpoint (`git diff origin/main...HEAD --stat`, then the diff). For each new or changed screen or rule, check that a test in `e2e/` covers it. Treat a gap around money, approvals, login or cancelling as risky, and say so.

## 6. Report

Lead with one line: **PASS** or **FAIL**, then how many checks passed out of how many, for example `PASS: 28/28 end-to-end, 31/31 unit, lint, types and build clean`.

Then, for each failure: what a guest or a staff member would see go wrong, on which screen size, and the step it broke on. Then the coverage gaps. Write in plain words; the reader is the restaurant owner.
