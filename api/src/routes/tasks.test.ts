import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { pool } from "../db.js";
import { hashPassword } from "../auth/password.js";

// The sense-check gate is the point of this table: anything created
// automatically must land as awaiting_sense_check, a person has to confirm
// it before it can be marked done, and the system never self-confirms.
// Fully self-contained fixtures, same pattern as points.test.ts.

let app: FastifyInstance;
let cookie: string;
let clientId: number;
let userId: number;

before(async () => {
  app = await buildApp();
  await app.ready();

  const email = `tasks-test-${Date.now()}@tcfp.test`;
  const passwordHash = await hashPassword("test-password-123");
  const { rows: userRows } = await pool.query<{ id: number }>(
    `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, 'Tasks Test Adviser', 'adviser') RETURNING id`,
    [email, passwordHash]
  );
  userId = userRows[0].id;

  const { rows: clientRows } = await pool.query<{ id: number }>(
    `INSERT INTO clients (first_names, surname, status, adviser_id, cm_id, review_cycle)
     VALUES ('Tasks Test', 'TESTCLIENT', 'Working', $1, $1, 'Annual') RETURNING id`,
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
  await pool.query(`DELETE FROM clients WHERE id = $1`, [clientId]);
  await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
  await pool.query(`UPDATE users SET active = false WHERE id = $1`, [userId]);
  await app.close();
  await pool.end();
});

async function createTask(body: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: `/api/clients/${clientId}/tasks`,
    headers: { cookie },
    payload: body,
  });
}

async function patchTask(id: number, body: Record<string, unknown>) {
  return app.inject({ method: "PATCH", url: `/api/tasks/${id}`, headers: { cookie }, payload: body });
}

test("a manually-created task starts confirmed, attributed to its creator", async () => {
  const res = await createTask({ text: "Manual task", owner_id: userId });
  assert.equal(res.statusCode, 201);
  const body = res.json();
  assert.equal(body.source, "manual");
  assert.equal(body.status, "confirmed");
  assert.equal(body.confirmed_by, userId);
  assert.notEqual(body.confirmed_at, null);
});

for (const source of ["meeting_note", "sync"]) {
  test(`a task declaring source='${source}' starts awaiting_sense_check, never self-confirmed`, async () => {
    const res = await createTask({ text: `From ${source}`, owner_id: userId, source });
    assert.equal(res.statusCode, 201);
    const body = res.json();
    assert.equal(body.status, "awaiting_sense_check");
    assert.equal(body.confirmed_by, null);
    assert.equal(body.confirmed_at, null);
  });
}

test("an awaiting_sense_check task cannot be marked done without confirming first", async () => {
  const created = await createTask({ text: "Needs confirming", owner_id: userId, source: "sync" });
  const res = await patchTask(created.json().id, { status: "done" });
  assert.equal(res.statusCode, 400);
  assert.match(res.json().error, /[Cc]onfirm/);
});

test("confirming an awaiting_sense_check task sets confirmed_by/confirmed_at, then it can be marked done", async () => {
  const created = await createTask({ text: "Will be confirmed then done", owner_id: userId, source: "sync" });
  const id = created.json().id;

  const confirmRes = await patchTask(id, { status: "confirmed" });
  assert.equal(confirmRes.statusCode, 200);
  const confirmed = confirmRes.json();
  assert.equal(confirmed.status, "confirmed");
  assert.equal(confirmed.confirmed_by, userId);
  assert.notEqual(confirmed.confirmed_at, null);

  const doneRes = await patchTask(id, { status: "done" });
  assert.equal(doneRes.statusCode, 200);
  assert.equal(doneRes.json().status, "done");
});

test("a completed task cannot be moved back to confirmed", async () => {
  const created = await createTask({ text: "Manual, will be completed", owner_id: userId });
  const id = created.json().id;
  await patchTask(id, { status: "done" });

  const res = await patchTask(id, { status: "confirmed" });
  assert.equal(res.statusCode, 400);
});

test("status can never be set back to awaiting_sense_check through the API", async () => {
  const created = await createTask({ text: "Manual task", owner_id: userId });
  const res = await patchTask(created.json().id, { status: "awaiting_sense_check" });
  assert.equal(res.statusCode, 400);
});

test("the DB itself refuses a confirmed/done task with no confirmed_by, independent of the API", async () => {
  const created = await createTask({ text: "Direct SQL constraint check", owner_id: userId, source: "sync" });
  const { id } = created.json();

  await assert.rejects(
    () => pool.query(`UPDATE tasks SET status = 'confirmed', confirmed_by = NULL, confirmed_at = NULL WHERE id = $1`, [id]),
    (err: { code?: string }) => err.code === "23514"
  );
});

test("the DB itself refuses an awaiting_sense_check task that already has a confirmer", async () => {
  const created = await createTask({ text: "Manual task", owner_id: userId });
  const { id } = created.json();

  await assert.rejects(
    () => pool.query(`UPDATE tasks SET status = 'awaiting_sense_check' WHERE id = $1`, [id]),
    (err: { code?: string }) => err.code === "23514"
  );
});

test("soft-deleted tasks are excluded from GET /api/tasks and can't be patched", async () => {
  const created = await createTask({ text: "Will be soft-deleted", owner_id: userId });
  const { id } = created.json();
  await pool.query(`UPDATE tasks SET deleted_at = now() WHERE id = $1`, [id]);

  const listRes = await app.inject({ method: "GET", url: "/api/tasks", headers: { cookie } });
  const ids = listRes.json().map((t: { id: number }) => t.id);
  assert.ok(!ids.includes(id), "soft-deleted task must not appear in the list");

  const patchRes = await patchTask(id, { status: "confirmed" });
  assert.equal(patchRes.statusCode, 404);
});
