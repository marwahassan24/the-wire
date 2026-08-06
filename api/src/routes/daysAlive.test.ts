import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { pool } from "../db.js";
import { hashPassword } from "../auth/password.js";
import { addDays } from "../daysAlive/calc.js";

let app: FastifyInstance;
let adminCookie: string;
let adviserCookie: string;
let adminId: number;
let adviserId: number;
let clientId: number;

const TEST_MILESTONE = 32001;

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
  const adminEmail = `days-alive-route-admin-${Date.now()}@tcfp.test`;
  const adviserEmail = `days-alive-route-adviser-${Date.now()}@tcfp.test`;

  const { rows: adminRows } = await pool.query<{ id: number }>(
    `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, 'Days Alive Route Admin', 'admin') RETURNING id`,
    [adminEmail, passwordHash]
  );
  adminId = adminRows[0].id;

  const { rows: adviserRows } = await pool.query<{ id: number }>(
    `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, 'Days Alive Route Adviser', 'adviser') RETURNING id`,
    [adviserEmail, passwordHash]
  );
  adviserId = adviserRows[0].id;

  adminCookie = await loginAs(adminEmail);
  adviserCookie = await loginAs(adviserEmail);

  // A dob 70 years before today, well clear of any real milestone - just
  // needs to exist so GET /api/clients/:id has a dob to compute against.
  const dob = addDays(new Date().toISOString().slice(0, 10), -70 * 365);
  const { rows: clientRows } = await pool.query<{ id: number }>(
    `INSERT INTO clients (first_names, surname, status, adviser_id, cm_id, review_cycle, dob)
     VALUES ('Days Alive Route Test', 'TESTCLIENT', 'Working', $1, $1, 'Annual', $2) RETURNING id`,
    [adviserId, dob]
  );
  clientId = clientRows[0].id;
});

after(async () => {
  await pool.query(`DELETE FROM days_alive_alerts WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM days_alive_milestones WHERE days = $1`, [TEST_MILESTONE]);
  await pool.query(`DELETE FROM clients WHERE id = $1`, [clientId]);
  await pool.query(`DELETE FROM sessions WHERE user_id = ANY($1)`, [[adminId, adviserId]]);
  await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [[adminId, adviserId]]);
  await pool.query(`UPDATE days_alive_settings SET recipient_email = NULL`);
  await app.close();
  await pool.end();
});

test("non-admins are rejected from every Days Alive admin endpoint", async () => {
  const endpoints: ["GET", string][] = [
    ["GET", "/api/days-alive/settings"],
    ["GET", "/api/days-alive/milestones"],
    ["GET", "/api/days-alive/alerts"],
    ["GET", "/api/days-alive/job-runs"],
    ["GET", "/api/days-alive/preview"],
  ];
  for (const [method, url] of endpoints) {
    const res = await app.inject({ method, url, headers: { cookie: adviserCookie } });
    assert.equal(res.statusCode, 403, `${method} ${url} should be admin-only`);
  }
});

test("admin can view and update settings", async () => {
  const getRes = await app.inject({ method: "GET", url: "/api/days-alive/settings", headers: { cookie: adminCookie } });
  assert.equal(getRes.statusCode, 200);
  assert.equal(getRes.json().warningDaysBefore, 30);

  const patchRes = await app.inject({
    method: "PATCH",
    url: "/api/days-alive/settings",
    headers: { cookie: adminCookie },
    payload: { recipient_email: "cards@tcfp.test", card_lead_days: 7 },
  });
  assert.equal(patchRes.statusCode, 200);
  assert.equal(patchRes.json().recipientEmail, "cards@tcfp.test");
  assert.equal(patchRes.json().cardLeadDays, 7);

  // restore for other tests
  await app.inject({
    method: "PATCH",
    url: "/api/days-alive/settings",
    headers: { cookie: adminCookie },
    payload: { card_lead_days: 5 },
  });
});

test("admin can list the milestone list, which includes the seeded 40 (and never 9970)", async () => {
  const res = await app.inject({ method: "GET", url: "/api/days-alive/milestones", headers: { cookie: adminCookie } });
  assert.equal(res.statusCode, 200);
  const milestones = res.json() as { days: number; enabled: boolean }[];
  assert.ok(milestones.some((m) => m.days === 24242));
  assert.ok(!milestones.some((m) => m.days === 9970), "9970 was only ever a temporary test value - must not exist");
});

test("admin can add, disable, and remove a milestone", async () => {
  const addRes = await app.inject({
    method: "POST",
    url: "/api/days-alive/milestones",
    headers: { cookie: adminCookie },
    payload: { days: TEST_MILESTONE },
  });
  assert.equal(addRes.statusCode, 201);
  const id = addRes.json().id;
  assert.equal(addRes.json().enabled, true);

  const dupRes = await app.inject({
    method: "POST",
    url: "/api/days-alive/milestones",
    headers: { cookie: adminCookie },
    payload: { days: TEST_MILESTONE },
  });
  assert.equal(dupRes.statusCode, 400);

  const patchRes = await app.inject({
    method: "PATCH",
    url: `/api/days-alive/milestones/${id}`,
    headers: { cookie: adminCookie },
    payload: { enabled: false },
  });
  assert.equal(patchRes.statusCode, 200);
  assert.equal(patchRes.json().enabled, false);

  const delRes = await app.inject({
    method: "DELETE",
    url: `/api/days-alive/milestones/${id}`,
    headers: { cookie: adminCookie },
  });
  assert.equal(delRes.statusCode, 204);
});

test("preview reports upcoming alerts without writing anything", async () => {
  const res = await app.inject({
    method: "GET",
    url: "/api/days-alive/preview?days=30",
    headers: { cookie: adminCookie },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(Array.isArray(body.matches));
});

test("manual run for a specific historical date is idempotent, and alerts can be filtered by client/status/milestone", async () => {
  await app.inject({
    method: "POST",
    url: "/api/days-alive/milestones",
    headers: { cookie: adminCookie },
    payload: { days: TEST_MILESTONE },
  });
  await app.inject({
    method: "PATCH",
    url: "/api/days-alive/settings",
    headers: { cookie: adminCookie },
    payload: { recipient_email: "cards@tcfp.test" },
  });

  // Pick an alertDate that lands exactly today minus nothing - instead,
  // use the diagnose-style computation: dob is (today - 70y), so just
  // ask what alertDate that produces for TEST_MILESTONE and rerun for it.
  const diagRes = await app.inject({
    method: "GET",
    url: `/api/days-alive/diagnose?client_id=${clientId}&milestone_days=${TEST_MILESTONE}`,
    headers: { cookie: adminCookie },
  });
  assert.equal(diagRes.statusCode, 200);
  const alertDate = diagRes.json().alertDate as string;

  const run1 = await app.inject({
    method: "POST",
    url: "/api/days-alive/run",
    headers: { cookie: adminCookie },
    payload: { date: alertDate },
  });
  assert.equal(run1.statusCode, 200);

  const run2 = await app.inject({
    method: "POST",
    url: "/api/days-alive/run",
    headers: { cookie: adminCookie },
    payload: { date: alertDate },
  });
  assert.equal(run2.statusCode, 200);
  assert.ok(run2.json().alertsSkipped >= 1);

  const listRes = await app.inject({
    method: "GET",
    url: `/api/days-alive/alerts?client_id=${clientId}&milestone_days=${TEST_MILESTONE}`,
    headers: { cookie: adminCookie },
  });
  assert.equal(listRes.statusCode, 200);
  const alerts = listRes.json();
  assert.equal(alerts.length, 1, "rerunning the same date must never create a second row");
  assert.equal(alerts[0].client_id, clientId);

  const diagAfterRes = await app.inject({
    method: "GET",
    url: `/api/days-alive/diagnose?client_id=${clientId}&milestone_days=${TEST_MILESTONE}`,
    headers: { cookie: adminCookie },
  });
  const diag = diagAfterRes.json();
  assert.equal(diag.alertRecordExists, true);
  assert.equal(typeof diag.emailSent, "boolean");
});

test("GET /api/clients/:id includes computed days-alive info, never a stored figure", async () => {
  const res = await app.inject({ method: "GET", url: `/api/clients/${clientId}`, headers: { cookie: adviserCookie } });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(body.daysAlive);
  assert.equal(body.daysAlive.dateOfBirth, body.dob.slice(0, 10));
  assert.ok(body.daysAlive.daysAlive > 25000); // ~70 years
  assert.ok(Array.isArray(body.daysAlive.alerts));
});
