import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

function buildPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.local.example to .env.local and fill it in."
    );
  }
  return new Pool({ connectionString, max: 5, idleTimeoutMillis: 30_000 });
}

export const pool: Pool = global.__pgPool ?? (global.__pgPool = buildPool());

export async function query<T>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await pool.query(sql, params);
  return result.rows as T[];
}
