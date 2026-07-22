import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { pool } from "../db.js";
import { hashPassword } from "../auth/password.js";

// Search is explicitly called out in the brief as mattering more than it
// looks. Coverage here: it actually finds content in each of the four
// sections, it never surfaces soft-deleted rows or soft-deleted clients'
// data, and the highlight markers it emits are the safe control-character
// kind (not HTML) so a front end can render them without risking XSS.

let app: FastifyInstance;
let cookie: string;
let clientId: number;
let userId: number;

// A unique token per test run so assertions never depend on, or collide
// with, seed data or leftovers from a previous run.
const token = `zzsearchtoken${Date.now()}`;

before(async () => {
  app = await buildApp();
  await app.ready();

  const email = `search-test-${Date.now()}@tcfp.test`;
  const passwordHash = await hashPassword("test-password-123");
  const { rows: userRows } = await pool.query<{ id: number }>(
    `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, 'Search Test Adviser', 'adviser') RETURNING id`,
    [email, passwordHash]
  );
  userId = userRows[0].id;

  const { rows: clientRows } = await pool.query<{ id: number }>(
    `INSERT INTO clients (first_names, surname, status, adviser_id, cm_id, review_cycle)
     VALUES ('Search Test', 'TESTCLIENT', 'Working', $1, $1, 'Annual') RETURNING id`,
    [userId]
  );
  clientId = clientRows[0].id;

  await pool.query(
    `INSERT INTO soft_facts (client_id, fact_date, text, author_id) VALUES ($1, CURRENT_DATE, $2, $1)`,
    [clientId, `Mentioned enjoying ${token} on weekends.`]
  );
  await pool.query(`INSERT INTO points (client_id, number, text, status) VALUES ($1, 1, $2, 'open')`, [
    clientId,
    `Check the ${token} allowance before year end.`,
  ]);
  await pool.query(
    `INSERT INTO meeting_notes (client_id, meeting_date, meeting_type, body, author_id, status, approved_by, approved_at)
     VALUES ($1, CURRENT_DATE, 'Ad hoc', $2, $1, 'approved', $1, now())`,
    [clientId, `Discussed the ${token} plan at length.`]
  );
  await pool.query(
    `INSERT INTO portfolio_summary (client_id, summary, updated_by) VALUES ($1, $2, $1)`,
    [clientId, `Portfolio touches on ${token} exposure.`]
  );

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

async function search(q: string) {
  return app.inject({ method: "GET", url: `/api/search?q=${encodeURIComponent(q)}`, headers: { cookie } });
}

test("finds a match in each of the four sections", async () => {
  const res = await search(token);
  assert.equal(res.statusCode, 200);
  const types = res.json().map((r: { entity_type: string }) => r.entity_type).sort();
  assert.deepEqual(types, ["meeting_note", "point", "portfolio_summary", "soft_fact"]);
});

test("excerpts wrap the matched term in the control-character markers, not HTML", async () => {
  const res = await search(token);
  const results = res.json();
  for (const r of results) {
    const HL_START = String.fromCharCode(1);
    const HL_STOP = String.fromCharCode(2);
    assert.ok(r.excerpt.includes(HL_START) && r.excerpt.includes(HL_STOP), `expected highlight markers in: ${JSON.stringify(r.excerpt)}`);
    assert.ok(!/<[a-z]/i.test(r.excerpt), "excerpt must not contain HTML tags");
  }
});

test("returns no results for a term that doesn't appear anywhere", async () => {
  const res = await search(`${token}-does-not-exist`);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), []);
});

test("400s when q is missing", async () => {
  const res = await app.inject({ method: "GET", url: "/api/search", headers: { cookie } });
  assert.equal(res.statusCode, 400);
});

test("excludes soft-deleted rows even when the text still matches", async () => {
  const { rows } = await pool.query<{ id: number }>(
    `SELECT id FROM soft_facts WHERE client_id = $1`,
    [clientId]
  );
  await pool.query(`UPDATE soft_facts SET deleted_at = now() WHERE id = $1`, [rows[0].id]);

  const res = await search(token);
  const types = res.json().map((r: { entity_type: string }) => r.entity_type);
  assert.ok(!types.includes("soft_fact"), "soft-deleted soft fact must not appear in results");

  await pool.query(`UPDATE soft_facts SET deleted_at = NULL WHERE id = $1`, [rows[0].id]);
});

test("excludes all content belonging to a soft-deleted client", async () => {
  await pool.query(`UPDATE clients SET deleted_at = now() WHERE id = $1`, [clientId]);

  const res = await search(token);
  assert.deepEqual(res.json(), []);

  await pool.query(`UPDATE clients SET deleted_at = NULL WHERE id = $1`, [clientId]);
});
