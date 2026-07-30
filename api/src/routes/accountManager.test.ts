import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { pool } from "../db.js";
import { hashPassword } from "../auth/password.js";

let app: FastifyInstance;
let adminCookie: string;
let adviserCookie: string;
let adminId: number;
let adviserId: number;
const createdUserIds: number[] = [];

async function loginAs(email: string) {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email, password: "test-password-123" },
  });
  assert.equal(res.statusCode, 200);
  const setCookie = res.cookies[0];
  return `${setCookie.name}=${setCookie.value}`;
}

before(async () => {
  app = await buildApp();
  await app.ready();

  const passwordHash = await hashPassword("test-password-123");
  const adminEmail = `account-manager-admin-${Date.now()}@tcfp.test`;
  const adviserEmail = `account-manager-adviser-${Date.now()}@tcfp.test`;

  const { rows: adminRows } = await pool.query<{ id: number }>(
    `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, 'Account Manager Test Admin', 'admin') RETURNING id`,
    [adminEmail, passwordHash]
  );
  adminId = adminRows[0].id;

  const { rows: adviserRows } = await pool.query<{ id: number }>(
    `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, 'Account Manager Test Adviser', 'adviser') RETURNING id`,
    [adviserEmail, passwordHash]
  );
  adviserId = adviserRows[0].id;

  adminCookie = await loginAs(adminEmail);
  adviserCookie = await loginAs(adviserEmail);
});

after(async () => {
  const allIds = [...createdUserIds, adminId, adviserId];
  // audit_log.user_id (the actor) has no cascade, so rows where the test
  // admin performed an action - regardless of which account it targeted -
  // would block deleting the admin below unless cleared first too.
  await pool.query(`DELETE FROM audit_log WHERE user_id = ANY($1) OR (entity_type = 'user' AND entity_id = ANY($1))`, [
    allIds,
  ]);
  await pool.query(`DELETE FROM sessions WHERE user_id = ANY($1)`, [allIds]);
  await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [allIds]);
  await app.close();
  await pool.end();
});

test("a non-admin is refused with 403 on every admin endpoint", async () => {
  const list = await app.inject({ method: "GET", url: "/api/admin/users", headers: { cookie: adviserCookie } });
  assert.equal(list.statusCode, 403);

  const create = await app.inject({
    method: "POST",
    url: "/api/admin/users",
    headers: { cookie: adviserCookie },
    payload: { email: "nope@tcfp.test", name: "Nope", role: "adviser", password: "password123" },
  });
  assert.equal(create.statusCode, 403);

  const update = await app.inject({
    method: "PATCH",
    url: `/api/admin/users/${adminId}`,
    headers: { cookie: adviserCookie },
    payload: { name: "Hijacked" },
  });
  assert.equal(update.statusCode, 403);

  const reset = await app.inject({
    method: "POST",
    url: `/api/admin/users/${adminId}/reset-password`,
    headers: { cookie: adviserCookie },
    payload: { password: "newpassword123" },
  });
  assert.equal(reset.statusCode, 403);
});

test("an admin can create an account, and the password_hash never appears in the response", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/api/admin/users",
    headers: { cookie: adminCookie },
    payload: {
      email: `new-account-${Date.now()}@tcfp.test`,
      name: "New Team Member",
      role: "client_manager",
      password: "a-strong-password",
    },
  });
  assert.equal(res.statusCode, 201);
  const created = res.json();
  createdUserIds.push(created.id);

  assert.equal(created.name, "New Team Member");
  assert.equal(created.role, "client_manager");
  assert.equal(created.active, true);
  assert.equal("password_hash" in created, false);

  const auditRes = await pool.query(`SELECT after FROM audit_log WHERE entity_type = 'user' AND entity_id = $1`, [
    created.id,
  ]);
  assert.equal(JSON.stringify(auditRes.rows[0].after).includes("password"), false);
});

test("creating an account with an already-used email is rejected with a clean 400", async () => {
  const email = `duplicate-${Date.now()}@tcfp.test`;
  const first = await app.inject({
    method: "POST",
    url: "/api/admin/users",
    headers: { cookie: adminCookie },
    payload: { email, name: "First", role: "adviser", password: "password123" },
  });
  assert.equal(first.statusCode, 201);
  createdUserIds.push(first.json().id);

  const second = await app.inject({
    method: "POST",
    url: "/api/admin/users",
    headers: { cookie: adminCookie },
    payload: { email, name: "Second", role: "adviser", password: "password123" },
  });
  assert.equal(second.statusCode, 400);
});

test("the account manager list includes inactive accounts, unlike the plain staff picker", async () => {
  const created = await app.inject({
    method: "POST",
    url: "/api/admin/users",
    headers: { cookie: adminCookie },
    payload: { email: `deactivate-me-${Date.now()}@tcfp.test`, name: "Deactivate Me", role: "adviser", password: "password123" },
  });
  const id = created.json().id;
  createdUserIds.push(id);

  await app.inject({
    method: "PATCH",
    url: `/api/admin/users/${id}`,
    headers: { cookie: adminCookie },
    payload: { active: false },
  });

  const list = await app.inject({ method: "GET", url: "/api/admin/users", headers: { cookie: adminCookie } });
  const listedIds = list.json().map((u: { id: number }) => u.id);
  assert.ok(listedIds.includes(id), "deactivated accounts must still be listed for an admin");

  const picker = await app.inject({ method: "GET", url: "/api/users", headers: { cookie: adminCookie } });
  const pickerIds = picker.json().map((u: { id: number }) => u.id);
  assert.ok(!pickerIds.includes(id), "the plain staff picker must not offer a deactivated user");
});

test("an admin can edit name, email and role, and it's captured in the audit log", async () => {
  const created = await app.inject({
    method: "POST",
    url: "/api/admin/users",
    headers: { cookie: adminCookie },
    payload: { email: `editme-${Date.now()}@tcfp.test`, name: "Old Name", role: "adviser", password: "password123" },
  });
  const id = created.json().id;
  createdUserIds.push(id);

  const res = await app.inject({
    method: "PATCH",
    url: `/api/admin/users/${id}`,
    headers: { cookie: adminCookie },
    payload: { name: "New Name", role: "client_manager" },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().name, "New Name");
  assert.equal(res.json().role, "client_manager");

  const { rows } = await pool.query(
    `SELECT before, after FROM audit_log WHERE entity_type = 'user' AND entity_id = $1 AND action = 'update' ORDER BY id DESC LIMIT 1`,
    [id]
  );
  assert.equal(rows[0].before.name, "Old Name");
  assert.equal(rows[0].after.name, "New Name");
});

test("an admin cannot deactivate their own account", async () => {
  const res = await app.inject({
    method: "PATCH",
    url: `/api/admin/users/${adminId}`,
    headers: { cookie: adminCookie },
    payload: { active: false },
  });
  assert.equal(res.statusCode, 400);
});

test("an admin cannot demote themselves away from admin", async () => {
  const res = await app.inject({
    method: "PATCH",
    url: `/api/admin/users/${adminId}`,
    headers: { cookie: adminCookie },
    payload: { role: "adviser" },
  });
  assert.equal(res.statusCode, 400);
});

test("editing a nonexistent user 404s", async () => {
  const res = await app.inject({
    method: "PATCH",
    url: "/api/admin/users/999999",
    headers: { cookie: adminCookie },
    payload: { name: "Ghost" },
  });
  assert.equal(res.statusCode, 404);
});

test("an admin can reset someone else's password, and they can log in with it", async () => {
  const email = `reset-me-${Date.now()}@tcfp.test`;
  const created = await app.inject({
    method: "POST",
    url: "/api/admin/users",
    headers: { cookie: adminCookie },
    payload: { email, name: "Reset Me", role: "adviser", password: "original-password" },
  });
  const id = created.json().id;
  createdUserIds.push(id);

  const reset = await app.inject({
    method: "POST",
    url: `/api/admin/users/${id}/reset-password`,
    headers: { cookie: adminCookie },
    payload: { password: "a-brand-new-password" },
  });
  assert.equal(reset.statusCode, 204);

  const loginWithOld = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email, password: "original-password" },
  });
  assert.equal(loginWithOld.statusCode, 401);

  const loginWithNew = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email, password: "a-brand-new-password" },
  });
  assert.equal(loginWithNew.statusCode, 200);

  const { rows } = await pool.query(
    `SELECT after FROM audit_log WHERE entity_type = 'user' AND entity_id = $1 ORDER BY id DESC LIMIT 1`,
    [id]
  );
  assert.equal(JSON.stringify(rows[0].after).includes("password"), true);
  assert.equal(JSON.stringify(rows[0].after).includes("a-brand-new-password"), false);
});
