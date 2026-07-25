import { Pool, type PoolClient } from "pg";
import { env } from "./env.js";

// Render's managed Postgres requires SSL; local Docker Postgres doesn't
// use it at all. rejectUnauthorized: false is the standard pattern for
// managed providers like Render/Heroku, whose certs aren't in Node's
// default trust store - the connection is still encrypted, just not
// pinned to a specific CA.
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
});

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
