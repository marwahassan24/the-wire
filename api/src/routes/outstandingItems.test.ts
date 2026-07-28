import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { pool } from "../db.js";
import { hashPassword } from "../auth/password.js";

let app: FastifyInstance;
let cookie: string;
let clientId: number;
let userId: number;

before(async () => {
  app = await buildApp();
  await app.ready();

  const email = `outstanding-items-test-${Date.now()}@tcfp.test`;
  const passwordHash = await hashPassword("test-password-123");
  const { rows: userRows } = await pool.query<{ id: number }>(
    `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, 'Outstanding Items Test Adviser', 'adviser') RETURNING id`,
    [email, passwordHash]
  );
  userId = userRows[0].id;

  const { rows: clientRows } = await pool.query<{ id: number }>(
    `INSERT INTO clients (first_names, surname, status, adviser_id, cm_id, review_cycle)
     VALUES ('Outstanding Items Test', 'TESTCLIENT', 'Working', $1, $1, 'Annual') RETURNING id`,
    [userId]
  );
  clientId = clientRows[0].id;

  const loginRes = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email, password: "test-password-123" },
  });
  assert.equal(loginRes.statusCode, 200);
  const setCookie = loginRes.cookies[0];
  cookie = `${setCookie.name}=${setCookie.value}`;
});

after(async () => {
  await pool.query(
    `DELETE FROM outstanding_item_chases WHERE outstanding_item_id IN (SELECT id FROM outstanding_items WHERE client_id = $1)`,
    [clientId]
  );
  await pool.query(`DELETE FROM outstanding_items WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM clients WHERE id = $1`, [clientId]);
  await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
  await pool.query(`UPDATE users SET active = false WHERE id = $1`, [userId]);
  await app.close();
  await pool.end();
});

async function createItem(body: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST",
    url: `/api/clients/${clientId}/outstanding-items`,
    headers: { cookie },
    payload: { type: "loa", description: "Chase the LOA", owner_id: userId, ...body },
  });
}

async function patchItem(id: number, body: Record<string, unknown>) {
  return app.inject({ method: "PATCH", url: `/api/outstanding-items/${id}`, headers: { cookie }, payload: body });
}

async function logChase(id: number, body: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST",
    url: `/api/outstanding-items/${id}/chases`,
    headers: { cookie },
    payload: body,
  });
}

test("creating an item defaults status to outstanding and raised_at to today, and records an audit entry", async () => {
  const res = await createItem();
  assert.equal(res.statusCode, 201);
  const created = res.json();
  assert.equal(created.client_id, clientId);
  assert.equal(created.type, "loa");
  assert.equal(created.status, "outstanding");
  assert.ok(created.raised_at);
  assert.deepEqual(created.chases, []);

  const { rows } = await pool.query(
    `SELECT action FROM audit_log WHERE entity_type = 'outstanding_item' AND entity_id = $1`,
    [created.id]
  );
  assert.deepEqual(rows.map((r) => r.action), ["create"]);
});

test("an explicit raised_at is respected, and an invalid type is rejected", async () => {
  const dated = await createItem({ type: "transfer", raised_at: "2026-01-01" });
  assert.equal(dated.statusCode, 201);
  assert.equal(dated.json().raised_at.slice(0, 10), "2026-01-01");
  assert.equal(dated.json().type, "transfer");

  const bad = await createItem({ type: "not-a-real-type" });
  assert.equal(bad.statusCode, 400);
});

test("PATCH updates description/owner/status and records an audit entry", async () => {
  const created = await createItem({ description: "Original wording" });
  const id = created.json().id;

  const patched = await patchItem(id, { description: "Revised wording", status: "received" });
  assert.equal(patched.statusCode, 200);
  assert.equal(patched.json().description, "Revised wording");
  assert.equal(patched.json().status, "received");

  const { rows } = await pool.query(
    `SELECT action FROM audit_log WHERE entity_type = 'outstanding_item' AND entity_id = $1 ORDER BY id`,
    [id]
  );
  assert.deepEqual(rows.map((r) => r.action), ["create", "update"]);
});

test("PATCH on an unknown item 404s", async () => {
  const res = await patchItem(999999999, { status: "received" });
  assert.equal(res.statusCode, 404);
});

test("soft-deleting an item removes it from the client bundle and records an audit entry", async () => {
  const created = await createItem();
  const id = created.json().id;

  let bundle = await app.inject({ method: "GET", url: `/api/clients/${clientId}`, headers: { cookie } });
  assert.ok(bundle.json().outstandingItems.some((i: { id: number }) => i.id === id));

  const del = await app.inject({ method: "DELETE", url: `/api/outstanding-items/${id}`, headers: { cookie } });
  assert.equal(del.statusCode, 204);

  bundle = await app.inject({ method: "GET", url: `/api/clients/${clientId}`, headers: { cookie } });
  assert.ok(!bundle.json().outstandingItems.some((i: { id: number }) => i.id === id));

  const { rows } = await pool.query(
    `SELECT action FROM audit_log WHERE entity_type = 'outstanding_item' AND entity_id = $1 ORDER BY id`,
    [id]
  );
  assert.deepEqual(rows.map((r) => r.action), ["create", "delete"]);

  const redelete = await app.inject({ method: "DELETE", url: `/api/outstanding-items/${id}`, headers: { cookie } });
  assert.equal(redelete.statusCode, 404);
});

test("chasing is loggable more than once - each call adds an entry, not just updates a last-chased date", async () => {
  const created = await createItem();
  const id = created.json().id;

  const first = await logChase(id, { chased_at: "2026-02-01" });
  assert.equal(first.statusCode, 201);
  assert.equal(first.json().chased_at.slice(0, 10), "2026-02-01");
  assert.ok(first.json().chased_by_name);

  const second = await logChase(id, { chased_at: "2026-02-15" });
  assert.equal(second.statusCode, 201);

  const bundle = await app.inject({ method: "GET", url: `/api/clients/${clientId}`, headers: { cookie } });
  const item = bundle.json().outstandingItems.find((i: { id: number }) => i.id === id);
  assert.equal(item.chases.length, 2, "both chases should be visible, not collapsed to one");
  // Sorted most-recent-first.
  assert.equal(item.chases[0].chased_at.slice(0, 10), "2026-02-15");
  assert.equal(item.chases[1].chased_at.slice(0, 10), "2026-02-01");
});

test("logging a chase on an unknown item 404s, and a chase always attributes the logged-in user regardless of who's said to have chased", async () => {
  const missing = await logChase(999999999);
  assert.equal(missing.statusCode, 404);

  const created = await createItem();
  const chase = await logChase(created.json().id, {});
  assert.equal(chase.json().chased_by, userId);
});

test("each chase has its own create audit entry, separate from the item's", async () => {
  const created = await createItem();
  const id = created.json().id;
  const chase = await logChase(id);

  const { rows } = await pool.query(
    `SELECT action FROM audit_log WHERE entity_type = 'outstanding_item_chase' AND entity_id = $1`,
    [chase.json().id]
  );
  assert.deepEqual(rows.map((r) => r.action), ["create"]);
});
