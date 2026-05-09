# WSB Pulse

Local pipeline + dashboard built around the existing n8n Wall Street Bets workflow.

```
n8n (host)  ──┐
              ├──→  Postgres 16 (Docker)  ←──  Next.js 15 dashboard (host, :3000)
n8n cron  ────┘
```

- **Wallstreet Bets v4** (n8n): replaces SharePoint with a single `posts` insert + `tickers` upsert per analyzed post. Discord alerts unchanged.
- **Research and Rate v1** (n8n): runs at 16:30 ET on weekdays. For each ticker active in the last 14 days, pulls Finnhub quote / company-news / metrics, then asks Claude to issue Buy/Sell/Hold with rationale. Writes to `research_snapshots` and `ratings`.
- **web/**: Next.js dashboard. Server components query Postgres directly via `pg`.

## One-time setup

### 1. Postgres

```bash
cd ~/Documents/Code/n8n/wsb
cp .env.example .env          # default creds are fine for local
docker compose up -d postgres
docker exec -it wsb-postgres psql -U wsb -d wsb -c '\dt'
```

If `docker compose` errors with a permission-denied on `/var/run/docker.sock`, your user isn't in the `docker` group. Fix once with:

```bash
sudo usermod -aG docker $USER
newgrp docker            # or just log out and back in
```

### 2. n8n credentials

Create three credentials in the n8n UI:

| Type            | Name                       | Notes |
|-----------------|----------------------------|-------|
| Postgres        | `Postgres - wsb`           | host `localhost`, port `5432`, db `wsb`, user `wsb`, pwd `wsb` (or whatever's in `.env`). |
| Header Auth     | `Finnhub - X-Finnhub-Token`| Header name `X-Finnhub-Token`, value is your Finnhub API key. |
| (already exists)| `Anthropic account`        | Reused. |
| (already exists)| `Reddit account`           | Reused. |
| (already exists)| `Discord Webhook account`  | Reused. |

Get a Finnhub key (free): https://finnhub.io/dashboard

### 3. Import the workflows

In n8n: **Workflows → Import from File** for each:

- `workflows/Wallstreet Bets v4.json`
- `workflows/Research and Rate v1.json`

Both files reference credentials by id `REPLACE_WITH_POSTGRES_CREDENTIAL_ID` and `REPLACE_WITH_FINNHUB_CREDENTIAL_ID`. Open each Postgres / HTTP Request node and re-select the credential — n8n will pin the actual id on save.

Test with the manual trigger before activating the schedule triggers. Once both flows look healthy, **deactivate the old `Wallstreet Bets v3`** so you don't double-write.

### 4. Web app

Node 20+ required. Install via [`nvm`](https://github.com/nvm-sh/nvm) if you don't have it:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
exec $SHELL
nvm install 20
```

Then:

```bash
cd ~/Documents/Code/n8n/wsb/web
cp .env.local.example .env.local
npm install
npm run typecheck
npm run dev
```

Open <http://localhost:3000>. With an empty database you'll see the empty state; once v4 has run once, the table will populate, and after the first Research and Rate run each ticker will have a rating.

## Verification checklist

- [ ] `docker compose up -d postgres` is healthy (`docker compose ps` shows `healthy`).
- [ ] `\dt` inside `wsb-postgres` lists `posts`, `tickers`, `research_snapshots`, `ratings`.
- [ ] Manual run of v4 → `SELECT count(*) FROM posts;` increases.
- [ ] Discord still posts coloured embeds (regression check).
- [ ] Manual run of Research and Rate → `SELECT * FROM ratings ORDER BY created_at DESC LIMIT 5;` shows ratings.
- [ ] No 429s in n8n executions for the research workflow.
- [ ] `npm run typecheck && npm run lint` are clean.
- [ ] Dashboard renders rows; clicking a ticker shows price, sentiment chart, rating history, posts, news.

## Schema cheat sheet

See [`db/README.md`](./db/README.md) for connection info and example queries.

## Files

```
wsb/
├── docker-compose.yml
├── .env.example
├── db/
│   ├── init.sql                # schema (4 tables, 2 views)
│   └── README.md
├── workflows/
│   ├── Wallstreet Bets v4.json
│   └── Research and Rate v1.json
└── web/                        # Next.js 15 dashboard
    ├── app/
    │   ├── layout.tsx
    │   ├── page.tsx                       # dashboard table
    │   └── stocks/[ticker]/page.tsx       # detail page
    ├── components/                        # RatingBadge, StockTable, charts, lists
    ├── lib/
    │   ├── db.ts                          # singleton pg.Pool
    │   ├── queries.ts                     # typed query helpers
    │   └── format.ts
    └── package.json
```

## Deployment to a server

The whole stack runs from `docker compose`. The web container is built from `web/Dockerfile` (multi-stage Next.js standalone build, runs as non-root, ~150 MB image).

### Topology choices

| Mode | Stack | When to use |
|---|---|---|
| **Web + Postgres only** (default) | `docker compose up -d` | n8n already runs elsewhere (host, separate VM, n8n Cloud). Easiest. |
| **Web + Postgres + n8n** | `docker compose --profile n8n up -d` | Single-server deployment, no existing n8n. |

### Ship workflow

The whole `wsb/` directory is the deployment unit. From your laptop:

```bash
# Option A: rsync over SSH
rsync -av --exclude 'web/node_modules' --exclude 'web/.next' \
  ~/Documents/Code/n8n/wsb/ user@server:/srv/wsb/

# Option B: git push to a server-side bare repo, or clone from GitHub on the server.
```

Then on the server:

```bash
cd /srv/wsb
cp .env.example .env
$EDITOR .env                # set POSTGRES_PASSWORD to something real, plus
                            # N8N_ENCRYPTION_KEY if you're using the n8n profile
docker compose up -d --build
docker compose ps           # both services healthy
docker compose logs -f web  # watch the first request come in
```

The web image is built in-place from the source on the server. Subsequent deploys: rsync the new code, then `docker compose up -d --build web`.

### Reaching Postgres from existing n8n

- **n8n on host of the same server**: leave `127.0.0.1:5432:5432` published in `docker-compose.yml`, point the n8n Postgres credential at `localhost:5432`.
- **n8n inside this compose** (`--profile n8n`): point the credential at `postgres:5432` (service name).
- **n8n on a different machine**: change the `ports` mapping to publish on the right interface (e.g., a Tailscale IP) and lock down `pg_hba.conf` accordingly.

### Production hardening (do this before exposing to the internet)

1. **Front it with a reverse proxy** (Caddy, Traefik, or nginx) for HTTPS + auth. The web app has **no built-in auth** — anyone who can hit port 3000 can read everything.
   - Caddy one-liner (`Caddyfile`): `wsb.example.com { reverse_proxy localhost:3000 }`
   - Add HTTP basic auth with `basicauth` directive, or front with an OIDC proxy.
2. **Don't publish 3000 / 5432 / 5678 publicly.** Bind to `127.0.0.1` (already the default for Postgres) and let the reverse proxy reach them locally; or put the whole thing behind Tailscale.
3. **Back up the Postgres volume** — at minimum a daily `pg_dump` to S3 or wherever. The `wsb-pgdata` named volume is your only copy.
4. **Set a real `POSTGRES_PASSWORD`** in `.env` before the first `docker compose up` — once the volume is created the password is baked in and changing it later is fiddly.
5. **Keep `N8N_ENCRYPTION_KEY` somewhere safe** — losing it means losing every saved credential in n8n.

### Updating

```bash
cd /srv/wsb
git pull             # or rsync from your laptop
docker compose up -d --build web    # rebuilds web only
docker compose pull n8n && docker compose up -d n8n   # if you're running n8n in compose
```

Schema changes in `db/init.sql` are NOT auto-applied to an existing volume — `init.sql` only runs on first startup of an empty data directory. Apply migrations manually:

```bash
docker exec -i wsb-postgres psql -U wsb -d wsb < db/migrations/001-whatever.sql
```

(Create the `db/migrations/` folder when you have your first migration.)

## Out of scope (future work)

- Built-in auth / multi-user. (For now: reverse proxy + basicauth, or Tailscale.)
- Historical post backfill (we only get what the v3/v4 workflow has captured).
- Brokerage integration.
- Per-environment config beyond `.env`.
