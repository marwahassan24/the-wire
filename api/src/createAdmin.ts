/*
 * Creates exactly one admin user and touches nothing else - no truncation,
 * no other tables, no other rows. For the case seed.ts can't safely cover:
 * getting a working admin account onto a live instance without a full
 * reseed. Email and password come from env vars only, never hardcoded, so
 * no credential ends up in source control or in chat.
 *
 * Safe to run twice: the insert is ON CONFLICT (email) DO NOTHING, so a
 * second run (e.g. Render restarting the process after it exits) just
 * reports the account already exists rather than touching it.
 *
 * Usage: ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run create-admin --workspace api
 */
import { pool } from "./db.js";
import { hashPassword } from "./auth/password.js";

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || "Admin";

  if (!email) throw new Error("Missing required env var: ADMIN_EMAIL");
  if (!password) throw new Error("Missing required env var: ADMIN_PASSWORD");
  if (password.length < 8) throw new Error("ADMIN_PASSWORD must be at least 8 characters");

  const passwordHash = await hashPassword(password);

  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO users (email, password_hash, name, role, active)
     VALUES ($1, $2, $3, 'admin', true)
     ON CONFLICT (email) DO NOTHING
     RETURNING id`,
    [email, passwordHash, name]
  );

  if (rows.length === 0) {
    console.log(`A user with email ${email} already exists - no changes made.`);
  } else {
    console.log(`Created admin account for ${email}.`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
