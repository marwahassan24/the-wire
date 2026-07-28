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

  const email = `contact-log-test-${Date.now()}@tcfp.test`;
  const passwordHash = await hashPassword("test-password-123");
  const { rows: userRows } = await pool.query<{ id: number }>(
    `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, 'Contact Log Test Adviser', 'adviser') RETURNING id`,
    [email, passwordHash]
  );
  userId = userRows[0].id;

  const { rows: clientRows } = await pool.query<{ id: number }>(
    `INSERT INTO clients (first_names, surname, status, adviser_id, cm_id, review_cycle)
     VALUES ('Contact Log Test', 'TESTCLIENT', 'Working', $1, $1, 'Annual') RETURNING id`,
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
  await pool.query(`DELETE FROM contact_log WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM clients WHERE id = $1`, [clientId]);
  await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
  await pool.query(`UPDATE users SET active = false WHERE id = $1`, [userId]);
  await app.close();
  await pool.end();
});

async function createEntry(body: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: `/api/clients/${clientId}/contact-log`,
    headers: { cookie },
    payload: { type: "call", staff_id: userId, note: "Quick catch-up call.", ...body },
  });
}

test("creating a contact log entry defaults contact_date to today and records an audit entry", async () => {
  const res = await createEntry({});
  assert.equal(res.statusCode, 201);
  const created = res.json();
  assert.equal(created.client_id, clientId);
  assert.equal(created.type, "call");
  assert.equal(created.staff_id, userId);
  assert.equal(created.note, "Quick catch-up call.");
  assert.ok(created.contact_date);

  const { rows } = await pool.query(
    `SELECT action, entity_type, entity_id FROM audit_log WHERE entity_type = 'contact_log' AND entity_id = $1`,
    [created.id]
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].action, "create");
});

test("an explicit contact_date is respected, and an invalid type is rejected", async () => {
  const dated = await createEntry({ contact_date: "2026-01-15", type: "email" });
  assert.equal(dated.statusCode, 201);
  assert.equal(dated.json().contact_date.slice(0, 10), "2026-01-15");
  assert.equal(dated.json().type, "email");

  const bad = await createEntry({ type: "carrier pigeon" });
  assert.equal(bad.statusCode, 400);
});

test("soft-deleting a contact log entry removes it from the client bundle and records an audit entry", async () => {
  const created = await createEntry({});
  const id = created.json().id;

  let bundle = await app.inject({ method: "GET", url: `/api/clients/${clientId}`, headers: { cookie } });
  assert.ok(bundle.json().contactLog.some((c: { id: number }) => c.id === id));

  const del = await app.inject({ method: "DELETE", url: `/api/contact-log/${id}`, headers: { cookie } });
  assert.equal(del.statusCode, 204);

  bundle = await app.inject({ method: "GET", url: `/api/clients/${clientId}`, headers: { cookie } });
  assert.ok(!bundle.json().contactLog.some((c: { id: number }) => c.id === id));

  const { rows } = await pool.query(
    `SELECT action FROM audit_log WHERE entity_type = 'contact_log' AND entity_id = $1 ORDER BY id`,
    [id]
  );
  assert.deepEqual(rows.map((r) => r.action), ["create", "delete"]);

  const redelete = await app.inject({ method: "DELETE", url: `/api/contact-log/${id}`, headers: { cookie } });
  assert.equal(redelete.statusCode, 404);
});

test("GET /api/clients/:id derives lastContactDate as the most recent non-deleted entry", async () => {
  await pool.query(`DELETE FROM contact_log WHERE client_id = $1`, [clientId]);

  let bundle = await app.inject({ method: "GET", url: `/api/clients/${clientId}`, headers: { cookie } });
  assert.equal(bundle.json().lastContactDate, null, "no entries at all means no last contact date");

  await createEntry({ contact_date: "2026-02-01" });
  const recent = await createEntry({ contact_date: "2026-05-01" });

  bundle = await app.inject({ method: "GET", url: `/api/clients/${clientId}`, headers: { cookie } });
  assert.equal(bundle.json().lastContactDate.slice(0, 10), "2026-05-01", "most recent date should win");

  // Soft-deleting the most recent entry should fall back to the next one.
  await app.inject({ method: "DELETE", url: `/api/contact-log/${recent.json().id}`, headers: { cookie } });
  bundle = await app.inject({ method: "GET", url: `/api/clients/${clientId}`, headers: { cookie } });
  assert.equal(bundle.json().lastContactDate.slice(0, 10), "2026-02-01");
});

test("prep view surfaces recentContactLog and lastContactDate", async () => {
  await pool.query(`DELETE FROM contact_log WHERE client_id = $1`, [clientId]);
  await createEntry({ contact_date: "2026-03-10", type: "meeting", note: "Annual review meeting." });

  const prep = await app.inject({ method: "GET", url: `/api/clients/${clientId}/prep`, headers: { cookie } });
  assert.equal(prep.statusCode, 200);
  const body = prep.json();
  assert.equal(body.lastContactDate.slice(0, 10), "2026-03-10");
  assert.equal(body.recentContactLog.length, 1);
  assert.equal(body.recentContactLog[0].note, "Annual review meeting.");
  assert.equal(body.recentContactLog[0].staff_name, "Contact Log Test Adviser");
});
