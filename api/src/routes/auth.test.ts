import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { pool } from "../db.js";
import { hashPassword } from "../auth/password.js";

let app: FastifyInstance;
let cookie: string;
let userId: number;
const email = `auth-password-test-${Date.now()}@tcfp.test`;

before(async () => {
  app = await buildApp();
  await app.ready();

  const passwordHash = await hashPassword("original-password");
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, 'Auth Password Test User', 'adviser') RETURNING id`,
    [email, passwordHash]
  );
  userId = rows[0].id;

  const loginRes = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email, password: "original-password" },
  });
  assert.equal(loginRes.statusCode, 200);
  const setCookie = loginRes.cookies[0];
  cookie = `${setCookie.name}=${setCookie.value}`;
});

after(async () => {
  await pool.query(`DELETE FROM audit_log WHERE entity_type = 'user' AND entity_id = $1`, [userId]);
  await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
  await app.close();
  await pool.end();
});

test("requires the current password, not just a valid session", async () => {
  const res = await app.inject({
    method: "PATCH",
    url: "/api/auth/me/password",
    headers: { cookie },
    payload: { currentPassword: "wrong-password", newPassword: "a-new-password" },
  });
  assert.equal(res.statusCode, 400);
});

test("changes the password and the old one stops working", async () => {
  const res = await app.inject({
    method: "PATCH",
    url: "/api/auth/me/password",
    headers: { cookie },
    payload: { currentPassword: "original-password", newPassword: "a-new-password-123" },
  });
  assert.equal(res.statusCode, 204);

  const loginWithOld = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email, password: "original-password" },
  });
  assert.equal(loginWithOld.statusCode, 401);

  const loginWithNew = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email, password: "a-new-password-123" },
  });
  assert.equal(loginWithNew.statusCode, 200);
});

test("unauthenticated requests are refused", async () => {
  const res = await app.inject({
    method: "PATCH",
    url: "/api/auth/me/password",
    payload: { currentPassword: "whatever", newPassword: "a-new-password-123" },
  });
  assert.equal(res.statusCode, 401);
});
