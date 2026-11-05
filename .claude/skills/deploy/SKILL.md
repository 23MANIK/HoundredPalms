---
name: deploy
description: Put a merged change live on hundred-palms.vercel.app (Vercel production), then check it works. Use after a PR is merged to main and the owner has said to deploy.
---

# Deploy Hundred Palms to production

Vercel's Git auto-deploy does not fire for this repo, so every production
deploy is started by hand from a commit on `main`.

## Before you start

- The change is merged to `main` and the `check` CI job on its PR passed.
- The owner (Nikhil) said to put it live. A production deploy changes what
  guests and staff see, so get a clear "go" first.
- If the change adds a database migration, make sure `drizzle/` has the new
  SQL file and its meta snapshot. Migrations run only on production builds.

## Fixed values

| What | Value |
| --- | --- |
| Team | `team_xMTKuxklsXm8v3HItGpLRmlF` (23maniks-projects) |
| Project | `prj_2v1AqFpj8EamHQpPDDbTcEkcTl1j` (hundred-palms) |
| Repo | `23MANIK/HoundredPalms`, branch `main` |
| Live URL | https://hundred-palms.vercel.app |

The project's build command already runs `npm run db:migrate && npm run db:seed`
on production builds before `npm run build`. The seed is safe to run again: it does
nothing once restaurants exist. On an empty production database it refuses a
placeholder phone (like 9999999999) or an easy PIN, so set real values first.
On the live site, placeholder numbers can't sign in at all, so the live check
needs `E2E_STAFF_PHONE`/`E2E_STAFF_PIN` to be a real staff login (the Test Bot).

## Steps

1. Get the merge commit SHA: `git fetch origin main && git rev-parse FETCH_HEAD`.
2. Start the deploy with the Vercel MCP tool `create_deployment`:
   ```json
   {
     "teamId": "team_xMTKuxklsXm8v3HItGpLRmlF",
     "requestBody": {
       "name": "hundred-palms",
       "project": "prj_2v1AqFpj8EamHQpPDDbTcEkcTl1j",
       "target": "production",
       "gitSource": { "type": "github", "org": "23MANIK", "repo": "HoundredPalms", "ref": "main", "sha": "<SHA>" }
     }
   }
   ```
3. Wait for the build. Don't poll in a loop; run a background `sleep 90`
   and check with `get_deployment` until `readyState` is `READY` or `ERROR`.
4. If it is `ERROR`, read `list_deployment_events` for the build log, fix the
   cause in a new PR, and start again. Production keeps serving the last good
   deploy in the meantime.
5. Check the live site. The cloud sandbox can't reach `*.vercel.app`
   directly, so use `web_fetch_vercel_url` on:
   - `/` (home page loads)
   - `/staff/login` (staff login loads)
   - one table page `/t/<token>` (needs the database)
6. Look at `get_runtime_errors` for the new deploy. There should be none.
7. Tell the owner it's live, with the URL and one line on what changed.

## Rolling back

If the new deploy breaks something, use `request_rollback` (or promote the
previous READY production deploy) and tell the owner. A rollback does not undo
a database migration; write a new migration to reverse one.

## Notes

- Preview deploys share the production database and don't run migrations.
  Don't place test orders on previews.
- Secrets live in Vercel project env settings. Never print or ask for them in chat.
