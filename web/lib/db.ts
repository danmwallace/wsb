import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

function getPool(): Pool {
  if (global.__pgPool) return global.__pgPool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.local.example to .env.local and fill it in."
    );
  }
  global.__pgPool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
  });
  return global.__pgPool;
}

export async function query<T>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await getPool().query(sql, params);
  return result.rows as T[];
}
