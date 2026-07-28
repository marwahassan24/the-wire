import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { pool } from "../db.js";
import { hashPassword } from "../auth/password.js";

// The dashboard aggregates across every client/case/task/user in the
// database, so — unlike the other suites — most assertions here check
// inclusion/exclusion of this test's own fixtures rather than exact
// global totals, since other test files' fixtures (or seed data) may
// also be present depending on run order/concurrency. Workload is the
// one place exact values are safe to assert: it's grouped per user, and
// this test's user is freshly created with a unique email, so nothing
// else in the database can be attributing work to that user_id.

let app: FastifyInstance;
let cookie: string;
let clientId: number;
let userId: number;

before(async () => {
  app = await buildApp();
  await app.ready();

  const email = `ops-test-${Date.now()}@tcfp.test`;
  const passwordHash = await hashPassword("test-password-123");
  const { rows: userRows } = await pool.query<{ id: number }>(
    `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, 'Ops Test Adviser', 'adviser') RETURNING id`,
    [email, passwordHash]
  );
  userId = userRows[0].id;

  const { rows: clientRows } = await pool.query<{ id: number }>(
    `INSERT INTO clients (first_names, surname, status, adviser_id, cm_id, review_cycle)
     VALUES ('Ops Test', 'TESTCLIENT', 'Working', $1, $1, 'Annual') RETURNING id`,
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
  await pool.query(`DELETE FROM tasks WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM case_events WHERE case_id IN (SELECT id FROM cases WHERE client_id = $1)`, [
    clientId,
  ]);
  await pool.query(`DELETE FROM cases WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM clients WHERE id = $1`, [clientId]);
  await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
  await pool.query(`UPDATE users SET active = false WHERE id = $1`, [userId]);
  await app.close();
  await pool.end();
});

async function getDashboard(query = "") {
  const res = await app.inject({ method: "GET", url: `/api/ops/dashboard${query}`, headers: { cookie } });
  assert.equal(res.statusCode, 200);
  return res.json();
}

test("a client with a next_review_date appears in reviewsDue with adviser name and days_until", async () => {
  await pool.query(`UPDATE clients SET next_review_date = CURRENT_DATE + 5, next_review_type = 'Interim' WHERE id = $1`, [
    clientId,
  ]);

  const dashboard = await getDashboard();
  const entry = dashboard.reviewsDue.find((r: { id: number }) => r.id === clientId);
  assert.ok(entry, "client with a review date should appear in reviewsDue");
  assert.equal(entry.adviser_name, "Ops Test Adviser");
  assert.equal(entry.days_until, 5);
});

test("a client with no next_review_date does not appear in reviewsDue", async () => {
  await pool.query(`UPDATE clients SET next_review_date = NULL WHERE id = $1`, [clientId]);

  const dashboard = await getDashboard();
  const entry = dashboard.reviewsDue.find((r: { id: number }) => r.id === clientId);
  assert.equal(entry, undefined);
});

test("a case appears in its stage's pipeline bucket", async () => {
  const caseRes = await app.inject({
    method: "POST",
    url: `/api/clients/${clientId}/cases`,
    headers: { cookie },
    payload: { title: "Pipeline test case", stage: "Research", waiting_on: "provider" },
  });
  const caseId = caseRes.json().id;

  const dashboard = await getDashboard();
  const researchStage = dashboard.pipeline.find((p: { stage: string }) => p.stage === "Research");
  assert.ok(researchStage.cases.some((c: { id: number }) => c.id === caseId));

  await pool.query(`DELETE FROM case_events WHERE case_id = $1`, [caseId]);
  await pool.query(`DELETE FROM cases WHERE id = $1`, [caseId]);
});

test("workload reflects this user's own open task and case exactly, since the user is freshly created", async () => {
  const taskRes = await app.inject({
    method: "POST",
    url: `/api/clients/${clientId}/tasks`,
    headers: { cookie },
    payload: { text: "Ops workload task", owner_id: userId, due_date: "2020-01-01" },
  });
  const caseRes = await app.inject({
    method: "POST",
    url: `/api/clients/${clientId}/cases`,
    headers: { cookie },
    payload: { title: "Ops workload case", owner_id: userId },
  });

  const dashboard = await getDashboard();
  const entry = dashboard.workload.find((w: { id: number }) => w.id === userId);
  assert.ok(entry, "the test user should appear in workload (even freshly created, at zero or more)");
  assert.equal(entry.open_tasks, 1);
  assert.equal(entry.overdue_tasks, 1, "due_date in the past and not done should count as overdue");
  assert.equal(entry.open_cases, 1);
  assert.equal(typeof entry.open_tasks, "number", "counts must be real numbers, not bigint-as-string");

  await pool.query(`DELETE FROM tasks WHERE id = $1`, [taskRes.json().id]);
  await pool.query(`DELETE FROM case_events WHERE case_id = $1`, [caseRes.json().id]);
  await pool.query(`DELETE FROM cases WHERE id = $1`, [caseRes.json().id]);
});

test("a user with no work at all still appears in workload at zero, not omitted", async () => {
  const dashboard = await getDashboard();
  const entry = dashboard.workload.find((w: { id: number }) => w.id === userId);
  assert.ok(entry);
  assert.equal(entry.open_tasks, 0);
  assert.equal(entry.open_cases, 0);
});

test("soft-deleting the client removes its case from the pipeline and its owner's workload", async () => {
  const caseRes = await app.inject({
    method: "POST",
    url: `/api/clients/${clientId}/cases`,
    headers: { cookie },
    payload: { title: "Will be orphaned by soft-delete", owner_id: userId },
  });
  const caseId = caseRes.json().id;

  await pool.query(`UPDATE clients SET deleted_at = now() WHERE id = $1`, [clientId]);

  const dashboard = await getDashboard();
  const allPipelineCaseIds = dashboard.pipeline.flatMap((p: { cases: { id: number }[] }) =>
    p.cases.map((c) => c.id)
  );
  assert.ok(!allPipelineCaseIds.includes(caseId), "a soft-deleted client's case must not appear in the pipeline");

  const entry = dashboard.workload.find((w: { id: number }) => w.id === userId);
  assert.equal(entry.open_cases, 0, "a soft-deleted client's case must not count toward its owner's workload");

  await pool.query(`UPDATE clients SET deleted_at = NULL WHERE id = $1`, [clientId]);
  await pool.query(`DELETE FROM case_events WHERE case_id = $1`, [caseId]);
  await pool.query(`DELETE FROM cases WHERE id = $1`, [caseId]);
});

test("a client with no contact logged at all appears in goingQuiet at the default threshold", async () => {
  await pool.query(`DELETE FROM contact_log WHERE client_id = $1`, [clientId]);

  const dashboard = await getDashboard();
  assert.equal(dashboard.quietDays, 90, "default quiet window should be 90 days");
  const entry = dashboard.goingQuiet.find((g: { id: number }) => g.id === clientId);
  assert.ok(entry, "never-contacted client should appear in goingQuiet");
  assert.equal(entry.last_contact_date, null);
});

test("a client contacted today does not appear in goingQuiet", async () => {
  await pool.query(`DELETE FROM contact_log WHERE client_id = $1`, [clientId]);
  await app.inject({
    method: "POST",
    url: `/api/clients/${clientId}/contact-log`,
    headers: { cookie },
    payload: { type: "call", staff_id: userId, note: "Caught up today." },
  });

  const dashboard = await getDashboard();
  const entry = dashboard.goingQuiet.find((g: { id: number }) => g.id === clientId);
  assert.equal(entry, undefined, "a client contacted today should not be going quiet");

  await pool.query(`DELETE FROM contact_log WHERE client_id = $1`, [clientId]);
});

test("quiet_days is configurable and overrides the default", async () => {
  await pool.query(`DELETE FROM contact_log WHERE client_id = $1`, [clientId]);
  await app.inject({
    method: "POST",
    url: `/api/clients/${clientId}/contact-log`,
    headers: { cookie },
    payload: { type: "call", staff_id: userId, note: "Ten days ago.", contact_date: "2020-01-01" },
  });

  // A huge window swallows even a very old contact.
  const wide = await getDashboard("?quiet_days=100000");
  assert.equal(
    wide.goingQuiet.find((g: { id: number }) => g.id === clientId),
    undefined
  );

  // A 1-day window flags anything not contacted today.
  const narrow = await getDashboard("?quiet_days=1");
  const entry = narrow.goingQuiet.find((g: { id: number }) => g.id === clientId);
  assert.ok(entry, "a 1-day window should flag a client last contacted in 2020");
  assert.equal(narrow.quietDays, 1);

  await pool.query(`DELETE FROM contact_log WHERE client_id = $1`, [clientId]);
});

test("goingQuiet sorts longest-silent first: never-contacted before an old-but-dated contact", async () => {
  await pool.query(`DELETE FROM contact_log WHERE client_id = $1`, [clientId]);

  const { rows: otherClientRows } = await pool.query<{ id: number }>(
    `INSERT INTO clients (first_names, surname, status, adviser_id, cm_id, review_cycle)
     VALUES ('Ops Quiet Sort', 'TESTCLIENT', 'Working', $1, $1, 'Annual') RETURNING id`,
    [userId]
  );
  const otherClientId = otherClientRows[0].id;

  // clientId: never contacted. otherClientId: contacted, but long ago.
  await app.inject({
    method: "POST",
    url: `/api/clients/${otherClientId}/contact-log`,
    headers: { cookie },
    payload: { type: "call", staff_id: userId, note: "Ancient contact.", contact_date: "2020-01-01" },
  });

  const dashboard = await getDashboard();
  const ids = dashboard.goingQuiet.map((g: { id: number }) => g.id);
  const neverIdx = ids.indexOf(clientId);
  const oldIdx = ids.indexOf(otherClientId);
  assert.ok(neverIdx !== -1 && oldIdx !== -1);
  assert.ok(neverIdx < oldIdx, "never-contacted client should sort ahead of one contacted (however long ago)");

  await pool.query(`DELETE FROM contact_log WHERE client_id = $1`, [otherClientId]);
  await pool.query(`DELETE FROM clients WHERE id = $1`, [otherClientId]);
});
