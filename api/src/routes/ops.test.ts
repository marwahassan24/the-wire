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
  await pool.query(
    `DELETE FROM outstanding_item_chases WHERE outstanding_item_id IN (SELECT id FROM outstanding_items WHERE client_id = $1)`,
    [clientId]
  );
  await pool.query(`DELETE FROM outstanding_items WHERE client_id = $1`, [clientId]);
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

test("a case's stalled flag and stalledDays reflect the default 14-day threshold", async () => {
  const caseRes = await app.inject({
    method: "POST",
    url: `/api/clients/${clientId}/cases`,
    headers: { cookie },
    payload: { title: "Stalled threshold case" },
  });
  const caseId = caseRes.json().id;
  await pool.query(`UPDATE cases SET stage_updated_at = now() - interval '20 days' WHERE id = $1`, [caseId]);

  const dashboard = await getDashboard();
  assert.equal(dashboard.stalledDays, 14, "default stalled window should be 14 days");
  const found = dashboard.pipeline.flatMap((p: { cases: { id: number; stalled: boolean }[] }) => p.cases).find(
    (c: { id: number }) => c.id === caseId
  );
  assert.ok(found);
  assert.equal(found.stalled, true, "20 days idle exceeds the default 14-day threshold");

  await pool.query(`DELETE FROM case_events WHERE case_id = $1`, [caseId]);
  await pool.query(`DELETE FROM cases WHERE id = $1`, [caseId]);
});

test("stalled_days is configurable and changes both the per-case flag and the stalledCases stat", async () => {
  const caseRes = await app.inject({
    method: "POST",
    url: `/api/clients/${clientId}/cases`,
    headers: { cookie },
    payload: { title: "Configurable stalled case" },
  });
  const caseId = caseRes.json().id;
  await pool.query(`UPDATE cases SET stage_updated_at = now() - interval '20 days' WHERE id = $1`, [caseId]);

  const narrow = await getDashboard("?stalled_days=5");
  const narrowCase = narrow.pipeline
    .flatMap((p: { cases: { id: number; stalled: boolean }[] }) => p.cases)
    .find((c: { id: number }) => c.id === caseId);
  assert.equal(narrowCase.stalled, true, "20 days idle exceeds a 5-day threshold");

  const wide = await getDashboard("?stalled_days=100");
  const wideCase = wide.pipeline
    .flatMap((p: { cases: { id: number; stalled: boolean }[] }) => p.cases)
    .find((c: { id: number }) => c.id === caseId);
  assert.equal(wideCase.stalled, false, "20 days idle does not exceed a 100-day threshold");
  assert.equal(wide.stalledDays, 100);

  await pool.query(`DELETE FROM case_events WHERE case_id = $1`, [caseId]);
  await pool.query(`DELETE FROM cases WHERE id = $1`, [caseId]);
});

async function createOutstandingItem(body: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: `/api/clients/${clientId}/outstanding-items`,
    headers: { cookie },
    payload: { type: "loa", description: "Ops dashboard test item", owner_id: userId, ...body },
  });
}

test("outstanding items appear in the dashboard with default per-type thresholds and correct stats", async () => {
  const loa = await createOutstandingItem({ type: "loa" });
  const signature = await createOutstandingItem({ type: "signature", description: "Sig item" });
  const transfer = await createOutstandingItem({ type: "transfer", description: "Transfer item" });

  const dashboard = await getDashboard();
  assert.deepEqual(dashboard.outstandingItems.thresholds, { loa: 21, signature: 14, transfer: 45 });

  const ids = dashboard.outstandingItems.items.map((i: { id: number }) => i.id);
  assert.ok(ids.includes(loa.json().id));
  assert.ok(ids.includes(signature.json().id));
  assert.ok(ids.includes(transfer.json().id));

  assert.ok(dashboard.outstandingItems.stats.loa >= 1);
  assert.ok(dashboard.outstandingItems.stats.signature >= 1);
  assert.ok(dashboard.outstandingItems.stats.transfer >= 1);
});

test("an item just raised is not flagged; one older than its type's threshold is", async () => {
  const fresh = await createOutstandingItem({ type: "signature" });
  const old = await createOutstandingItem({ type: "signature", description: "Old signature chase" });
  await pool.query(`UPDATE outstanding_items SET raised_at = CURRENT_DATE - 30 WHERE id = $1`, [old.json().id]);

  const dashboard = await getDashboard();
  const freshItem = dashboard.outstandingItems.items.find((i: { id: number }) => i.id === fresh.json().id);
  const oldItem = dashboard.outstandingItems.items.find((i: { id: number }) => i.id === old.json().id);
  assert.equal(freshItem.flagged, false, "raised today should be well within the 14-day signature threshold");
  assert.equal(oldItem.flagged, true, "30 days old exceeds the 14-day signature threshold");
});

test("per-type thresholds are independently configurable via loa_days/signature_days/transfer_days", async () => {
  const item = await createOutstandingItem({ type: "loa" });
  await pool.query(`UPDATE outstanding_items SET raised_at = CURRENT_DATE - 10 WHERE id = $1`, [item.json().id]);

  const strict = await getDashboard("?loa_days=5");
  const strictItem = strict.outstandingItems.items.find((i: { id: number }) => i.id === item.json().id);
  assert.equal(strictItem.flagged, true, "10 days old exceeds a 5-day LOA threshold");
  assert.equal(strict.outstandingItems.thresholds.loa, 5);

  const lenient = await getDashboard("?loa_days=30");
  const lenientItem = lenient.outstandingItems.items.find((i: { id: number }) => i.id === item.json().id);
  assert.equal(lenientItem.flagged, false, "10 days old does not exceed a 30-day LOA threshold");
});

test("items are sorted oldest-raised first, and received/cancelled items are excluded", async () => {
  const younger = await createOutstandingItem({ type: "transfer", raised_at: "2026-03-01" });
  const older = await createOutstandingItem({ type: "transfer", raised_at: "2026-01-01" });
  const received = await createOutstandingItem({ type: "transfer", description: "Already sorted" });
  await app.inject({
    method: "PATCH",
    url: `/api/outstanding-items/${received.json().id}`,
    headers: { cookie },
    payload: { status: "received" },
  });

  const dashboard = await getDashboard();
  const ids = dashboard.outstandingItems.items.map((i: { id: number }) => i.id);
  assert.ok(!ids.includes(received.json().id), "received items should not appear as outstanding");

  const olderIdx = ids.indexOf(older.json().id);
  const youngerIdx = ids.indexOf(younger.json().id);
  assert.ok(olderIdx !== -1 && youngerIdx !== -1);
  assert.ok(olderIdx < youngerIdx, "the older raised_at should sort first");
});

test("a soft-deleted outstanding item does not appear on the dashboard", async () => {
  const item = await createOutstandingItem({ type: "loa", description: "Will be deleted" });
  await app.inject({ method: "DELETE", url: `/api/outstanding-items/${item.json().id}`, headers: { cookie } });

  const dashboard = await getDashboard();
  const ids = dashboard.outstandingItems.items.map((i: { id: number }) => i.id);
  assert.ok(!ids.includes(item.json().id));
});
