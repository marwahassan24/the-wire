import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { pool } from "../db.js";
import { hashPassword } from "../auth/password.js";

// One integration pass proving normalizeText is actually wired into every
// write path that accepts adviser-typed narrative content — not just
// asserted in isolation. Several of these routes (soft facts, meeting
// notes, portfolio) don't have their own test files yet, so this is their
// only coverage today; scoped deliberately to the em-dash-on-save
// behaviour rather than standing in for full route test suites.

let app: FastifyInstance;
let cookie: string;
let clientId: number;
let userId: number;

before(async () => {
  app = await buildApp();
  await app.ready();

  const email = `normalize-test-${Date.now()}@tcfp.test`;
  const passwordHash = await hashPassword("test-password-123");
  const { rows: userRows } = await pool.query<{ id: number }>(
    `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, 'Normalize Test Adviser', 'adviser') RETURNING id`,
    [email, passwordHash]
  );
  userId = userRows[0].id;

  const { rows: clientRows } = await pool.query<{ id: number }>(
    `INSERT INTO clients (first_names, surname, status, adviser_id, cm_id, review_cycle)
     VALUES ('Normalize Test', 'TESTCLIENT', 'Working', $1, $1, 'Annual') RETURNING id`,
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
  await pool.query(`DELETE FROM tasks WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM case_events WHERE case_id IN (SELECT id FROM cases WHERE client_id = $1)`, [
    clientId,
  ]);
  await pool.query(`DELETE FROM cases WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM portfolio_log WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM portfolio_summary WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM meeting_notes WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM points WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM soft_facts WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM clients WHERE id = $1`, [clientId]);
  await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
  await pool.query(`UPDATE users SET active = false WHERE id = $1`, [userId]);
  await app.close();
  await pool.end();
});

const withDash = "Discussed the plan — nothing needed changing.";
const normalized = "Discussed the plan - nothing needed changing.";

test("soft fact text is normalised on create and on edit", async () => {
  const created = await app.inject({
    method: "POST",
    url: `/api/clients/${clientId}/soft-facts`,
    headers: { cookie },
    payload: { text: withDash },
  });
  assert.equal(created.json().text, normalized);

  const edited = await app.inject({
    method: "PATCH",
    url: `/api/soft-facts/${created.json().id}`,
    headers: { cookie },
    payload: { text: withDash },
  });
  assert.equal(edited.json().text, normalized);
});

test("point text and raised_context are normalised on create", async () => {
  const created = await app.inject({
    method: "POST",
    url: `/api/clients/${clientId}/points`,
    headers: { cookie },
    payload: { text: withDash, raised_context: "Interim — Feb 2026" },
  });
  assert.equal(created.json().text, normalized);
  assert.equal(created.json().raised_context, "Interim - Feb 2026");
});

test("meeting note body is normalised on create and on edit", async () => {
  const created = await app.inject({
    method: "POST",
    url: `/api/clients/${clientId}/meeting-notes`,
    headers: { cookie },
    payload: { meeting_date: "2026-01-01", meeting_type: "Ad hoc", body: withDash },
  });
  assert.equal(created.json().body, normalized);

  const edited = await app.inject({
    method: "PATCH",
    url: `/api/meeting-notes/${created.json().id}`,
    headers: { cookie },
    payload: { body: withDash + withDash },
  });
  assert.equal(edited.json().body, normalized + normalized);
});

test("portfolio summary is normalised on save", async () => {
  const res = await app.inject({
    method: "PUT",
    url: `/api/clients/${clientId}/portfolio`,
    headers: { cookie },
    payload: { summary: withDash },
  });
  assert.equal(res.json().summary, normalized);
});

test("portfolio log text is normalised on create", async () => {
  const res = await app.inject({
    method: "POST",
    url: `/api/clients/${clientId}/portfolio-log`,
    headers: { cookie },
    payload: { text: withDash },
  });
  assert.equal(res.json().text, normalized);
});

test("task text is normalised on create and on edit", async () => {
  const created = await app.inject({
    method: "POST",
    url: `/api/clients/${clientId}/tasks`,
    headers: { cookie },
    payload: { text: withDash, owner_id: userId },
  });
  assert.equal(created.json().text, normalized);

  const edited = await app.inject({
    method: "PATCH",
    url: `/api/tasks/${created.json().id}`,
    headers: { cookie },
    payload: { text: withDash + withDash },
  });
  assert.equal(edited.json().text, normalized + normalized);
});

test("case title is normalised on create and on edit; case_events note is normalised on transition", async () => {
  const created = await app.inject({
    method: "POST",
    url: `/api/clients/${clientId}/cases`,
    headers: { cookie },
    payload: { title: withDash },
  });
  assert.equal(created.json().title, normalized);

  const transitioned = await app.inject({
    method: "PATCH",
    url: `/api/cases/${created.json().id}`,
    headers: { cookie },
    payload: { title: withDash + withDash, stage: "Research", note: withDash },
  });
  assert.equal(transitioned.json().title, normalized + normalized);

  const { rows } = await pool.query<{ note: string }>(
    `SELECT note FROM case_events WHERE case_id = $1 ORDER BY id DESC LIMIT 1`,
    [created.json().id]
  );
  assert.equal(rows[0].note, normalized);
});
