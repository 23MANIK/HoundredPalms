# Hundred Palms

QR table ordering for Hundred Palms, Mahoba. See README.md for how it works.

## Checkpoints

After finishing a feature or before calling a PR ready, run the `qa-tester` agent (`.claude/agents/qa-tester.md`), or at least:

```bash
npm run lint && npm run typecheck && npm test && npm run build && npm run e2e
```

When a change adds or changes a screen or a rule, add or update a check in `e2e/` in the same PR. GitHub Actions runs the end-to-end checks on every PR (`e2e` job) and against the live site after each deploy and every morning (`Live site check`).
