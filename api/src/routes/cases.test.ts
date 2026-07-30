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

  const email = `cases-test-${Date.now()}@tcfp.test`;
  const passwordHash = await hashPassword("test-password-123");
  const { rows: userRows } = await pool.query<{ id: number }>(
    `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, 'Cases Test Adviser', 'adviser') RETURNING id`,
    [email, passwordHash]
  );
  userId = userRows[0].id;

  const { rows: clientRows } = await pool.query<{ id: number }>(
    `INSERT INTO clients (first_names, surname, status, adviser_id, cm_id, review_cycle)
     VALUES ('Cases Test', 'TESTCLIENT', 'Working', $1, $1, 'Annual') RETURNING id`,
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
    `DELETE FROM case_events WHERE case_id IN (SELECT id FROM cases WHERE client_id = $1)`,
    [clientId]
  );
  await pool.query(`DELETE FROM cases WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM clients WHERE id = $1`, [clientId]);
  await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
  await pool.query(`UPDATE users SET active = false WHERE id = $1`, [userId]);
  await app.close();
  await pool.end();
});

async function createCase(body: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: `/api/clients/${clientId}/cases`,
    headers: { cookie },
    payload: { stage: "Fact Find", ...body },
  });
}

async function patchCase(id: number, body: Record<string, unknown>) {
  return app.inject({ method: "PATCH", url: `/api/cases/${id}`, headers: { cookie }, payload: body });
}

test("creating a case logs its chosen starting stage as a case_event, not just the DB default", async () => {
  const res = await createCase({ title: "New case", stage: "Suitability Report" });
  assert.equal(res.statusCode, 201);
  const { id, stage } = res.json();
  assert.equal(stage, "Suitability Report");

  const { rows } = await pool.query(`SELECT from_stage, to_stage FROM case_events WHERE case_id = $1`, [id]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].from_stage, null);
  assert.equal(rows[0].to_stage, "Suitability Report");
});

test("creating a case without a stage is rejected - there is no default, it must be chosen", async () => {
  const res = await app.inject({
    method: "POST",
    url: `/api/clients/${clientId}/cases`,
    headers: { cookie },
    payload: { title: "No stage given" },
  });
  assert.equal(res.statusCode, 400);
});

test("creating a case can set waiting_on up front instead of leaving it unset", async () => {
  const res = await createCase({ title: "Waiting on set at creation", waiting_on: "client" });
  assert.equal(res.statusCode, 201);
  assert.equal(res.json().waiting_on, "client");
});

test("changing stage logs a case_event with from/to and the given note", async () => {
  const created = await createCase({ title: "Stage change case" });
  const id = created.json().id;

  const res = await patchCase(id, { stage: "Research", note: "Kicking off research." });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().stage, "Research");

  const { rows } = await pool.query(
    `SELECT from_stage, to_stage, note FROM case_events WHERE case_id = $1 ORDER BY id`,
    [id]
  );
  assert.equal(rows.length, 2);
  assert.deepEqual(
    { from: rows[1].from_stage, to: rows[1].to_stage, note: rows[1].note },
    { from: "Fact Find", to: "Research", note: "Kicking off research." }
  );
});

test("moving to Completed sets closed_at; moving away from Completed clears it", async () => {
  const created = await createCase({ title: "Completion case" });
  const id = created.json().id;

  const completedRes = await patchCase(id, { stage: "Completed" });
  assert.notEqual(completedRes.json().closed_at, null);

  const reopenedRes = await patchCase(id, { stage: "Research" });
  assert.equal(reopenedRes.json().closed_at, null);
});

test("updating a field without changing stage does not add a case_event", async () => {
  const created = await createCase({ title: "No-op stage case" });
  const id = created.json().id;

  await patchCase(id, { title: "Renamed, same stage" });

  const { rows } = await pool.query(`SELECT id FROM case_events WHERE case_id = $1`, [id]);
  assert.equal(rows.length, 1, "only the opening event should exist");
});

test("soft-deleted cases are excluded from GET /api/cases and can't be patched", async () => {
  const created = await createCase({ title: "Will be soft-deleted" });
  const id = created.json().id;
  await pool.query(`UPDATE cases SET deleted_at = now() WHERE id = $1`, [id]);

  const listRes = await app.inject({ method: "GET", url: "/api/cases", headers: { cookie } });
  const ids = listRes.json().map((c: { id: number }) => c.id);
  assert.ok(!ids.includes(id), "soft-deleted case must not appear in the list");

  const patchRes = await patchCase(id, { title: "should 404" });
  assert.equal(patchRes.statusCode, 404);
});
