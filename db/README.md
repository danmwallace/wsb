# wsb database

Postgres 16 running in Docker. Schema in `init.sql`, loaded automatically on first container start (via `/docker-entrypoint-initdb.d/`).

## Connection

From the host (n8n + Next.js):

```
postgres://wsb:wsb@localhost:5432/wsb
```

From inside another container on the same Docker network: host `wsb-postgres`.

## Common operations

```bash
# Bring it up
docker compose up -d postgres

# Open a shell
docker exec -it wsb-postgres psql -U wsb -d wsb

# Re-apply the schema (only on a fresh volume — init.sql runs once)
docker compose down -v && docker compose up -d postgres
```

## Useful queries

```sql
-- Tickers active in the last 14 days, most-mentioned first.
SELECT ticker, company, mention_count, last_seen_at
FROM tickers
WHERE last_seen_at > now() - interval '14 days'
ORDER BY mention_count DESC;

-- Daily sentiment counts for one ticker, last 30 days.
SELECT date_trunc('day', observed_at)::date AS day,
       sentiment,
       count(*) AS n
FROM posts
WHERE ticker = 'TSLA'
  AND observed_at > now() - interval '30 days'
GROUP BY day, sentiment
ORDER BY day DESC;

-- Latest rating per ticker (also exposed as v_latest_rating).
SELECT * FROM v_latest_rating ORDER BY confidence DESC LIMIT 20;
```
