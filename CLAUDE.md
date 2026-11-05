# Hundred Palms

QR table ordering for Hundred Palms, Mahoba. See README.md for how it works.

## Checkpoints

After finishing a feature or before calling a PR ready, run the `checkpoint-qa` skill (`.claude/skills/checkpoint-qa/SKILL.md`) or the `qa-tester` agent (`.claude/agents/qa-tester.md`). At the very least run:

```bash
npm run lint && npm run typecheck && npm test && npm run build && npm run e2e
```

When a change adds or changes a screen or a rule, add or update a check in `e2e/` in the same PR. GitHub Actions runs the end-to-end checks on every PR (`e2e` job) and against the live site after each deploy and every morning (`Live site check`).

## Working rules

- Screenshots and images from browser runs go to a subagent with `model: "haiku"`, which describes them. The main session never reads them itself.
- Any form, input or API body follows `.claude/skills/form-validation/SKILL.md`. Run the `form-auditor` agent after changing forms.
- Use the cheapest model the task needs. Haiku for simple subagent work (running checks, reading screenshots), Sonnet for code review and audits.
- Batch slow end-to-end runs when several PRs are in flight and nothing is urgent (see the `checkpoint-qa` skill).
- Package any long procedure that will be reused (like the checkpoint run) as a skill in `.claude/skills/`.

## Engineering rules

Correct table assignment, order integrity, privacy, accessibility and staff usability matter more than visual polish.

### Invariants
- Never ship seeded or default staff credentials to production. On the live site (`VERCEL_ENV=production`), placeholder numbers like 9999999999 can't sign in or be added, and the seed refuses them (`src/lib/live-site.ts`). Each person gets their own login under Manage → Staff.
- Enforce roles and venue/table scope in server endpoints (`requireStaff` in routes, `requireRole` in `src/lib/domain.ts`), not only in the UI.
- Guest browsing is anonymous; identity is requested only to place an order.
- Final order creation is idempotent, and the server calculates totals and tax.
- Orders are never silently duplicated, moved between tables or changed after stock validation.
- Every order has an immutable ID and a visible status history.
- Stock changes keep the cart and ask the guest how to recover.
- Dietary modifiers are per line item; allergies are prominent to kitchen staff.
- QR ordering is optional: keep the staff-assisted and paper-menu paths.
- Logs redact personal data and don't show raw internal event names.

### Before editing
1. Inspect the route, schema, API and tests.
2. State the affected invariants and the smallest safe plan.
3. Add tests for success, failure, concurrency and authorization.
4. Avoid unrelated changes.
5. Report the commands run, their results, and the risks not yet checked.
