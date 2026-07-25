import { randomBytes } from "node:crypto";
import { pool } from "../db.js";

export const SESSION_COOKIE = "wire_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, fixed at creation

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: string;
}

function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(userId: number): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await pool.query(
    `INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)`,
    [token, userId, expiresAt]
  );
  return { token, expiresAt };
}

export async function destroySession(token: string): Promise<void> {
  await pool.query(`DELETE FROM sessions WHERE token = $1`, [token]);
}

export async function getUserForToken(token: string): Promise<SessionUser | null> {
  const { rows } = await pool.query<SessionUser>(
    `SELECT u.id, u.email, u.name, u.role
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token = $1
        AND s.expires_at > now()
        AND u.active = true`,
    [token]
  );
  return rows[0] ?? null;
}
