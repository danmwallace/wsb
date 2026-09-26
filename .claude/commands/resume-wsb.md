---
description: Rebuild WSB Pulse context from the Obsidian project (status + open tasks) when resuming work
---

# Resume the WSB Pulse project

Rebuild context from the **Obsidian** project (the source of truth for status), then orient and ask what to tackle. Do this before proposing any work.

## 1. Read current status from Obsidian (authoritative)

- Read `~/Documents/Obsidian/Projects/WallStreetBetsApp/Project Overview.md`. Its `## Current Focus` section is the latest status.
- Read the task notes in `Projects/WallStreetBetsApp/Tasks/` and keep those whose frontmatter `status` is not `Done`; note each one's name, `priority`, and body. If the folder is empty, say so rather than guessing at open work.

## 2. Quick primer (as of 2026-05-28 — the Obsidian project is authoritative; verify against it)

- **Code** `~/Code/Infrastructure/sites/wsb`. Stack: n8n (Reddit scrape → Claude sentiment + daily Buy/Sell/Hold rating) → **Postgres 16** (Docker) → **Next.js 15** dashboard (`web/`, server components query Postgres via `pg`).
- **Runtime is remote, NOT this workstation.** Everything runs on the Ansible-managed host `10.10.70.6`: containers `wsb-postgres`, `wsb-web`, and n8n. Access: `ssh ansible@10.10.70.6` (that user is in the `docker` group); app dir `/opt/docker/wsb`. Local `docker`/`psql` do **not** work — wrap DB commands in SSH:
  - `ssh ansible@10.10.70.6 'docker exec -i wsb-postgres psql -U wsb -d wsb' < db/migrations/NNN.sql`
  - `ssh ansible@10.10.70.6 "docker exec -i wsb-postgres psql -U wsb -d wsb -c '\\dt'"`
  - No local-dev DB and `10.10.70.6:5432` isn't reachable from the workstation, so `npm run dev` visual checks need an SSH tunnel (or verify on the deployed site). See project memory `[[wsb-deployment]]`.
- **Deploy** is via the `danmwallace.private.wsb` Ansible playbook driven from `~/Code/Infrastructure/ansible-homelab-cfg` (not ad-hoc rsync — rsync clobbers the vaulted `.env`). Live site `wsb.ai.wallace.boston`; n8n at `agents.ai.wallace.boston`.
- **n8n workflows** (the running instance is source-of-truth for these): `Wallstreet Bets v4` (scrape + sentiment; **gitignored**), `Research and Rate v1` (daily 16:30 ET rating; **tracked** in git), `Cleanup and Archive v1` (Sun 03:00 ET archive >90d; tracked). Re-import resets credentials to `REPLACE_WITH_*` placeholders — re-pin `Finnhub - X-Finnhub-Token` and `Postgres - wsb` after every import.
- **Shipped:** public-launch readiness (site chrome, SEO, ad slots, pagination, cached reads); **analyst consensus & price targets** (consensus badge + distribution bar on the ticker detail page; fed by Finnhub `recommendation`). Finnhub `price-target` is premium (403 free tier) so it's dropped — `target_*` always null, no Upside column.
- **n8n gotchas** (project memory — verify they still apply): after a Postgres node, read upstream data via `$('NamedNode').item.json`, **not** `$json` (`[[n8n-postgres-node-passthrough]]`); an HTTP node **splits a JSON array response into one item per element**, so array endpoints need an aggregate Code node + `alwaysOutputData` (`[[n8n-http-array-split]]`).

## 3. Likely open threads (confirm against the Obsidian tasks)

- **Deploy the merged UI** (deploy task): `main` has the analyst-view UI + the price-target UI removal merged but **not live** until `wsb-web` is rebuilt/redeployed via the playbook. The n8n data pipeline is already live (analyst_snapshots populating).
- **Standardize wsb deploys** on the `danmwallace.private.wsb` playbook (task open): confirm it deploys the full stack end-to-end; document the invocation; retire ad-hoc rsync.
- **Activate `Cleanup and Archive v1`** on the running stack (task In progress): migration `002` is applied and the workflow now also archives `analyst_snapshots`; remaining is import + re-bind cred + manual-run + activate the Sunday schedule.
- **"More sources" specs** (3 next-step tasks, each its own brainstorm → spec → plan → build): more subreddits (r/stocks, r/investing, r/options) + a `source` column on `posts`; Yahoo options chain → put/call ratio + IV signal; StockTwits bull/bear feed.

## 4. Then

Summarize where things stand in 3-5 lines, lead with what's `In progress`, and ask which thread to pick up.
