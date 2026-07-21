import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { pool } from "../db.js";
import { hashPassword } from "../auth/password.js";

// End-to-end coverage of the points carry-forward rules, since the brief
// calls this the load-bearing behaviour: a point can't leave 'open' without
// a resolution note, numbers are per-client sequential and never reused
// (even under concurrent writes), and points never disappear from history.
//
// Fully self-contained: creates its own user/client fixtures rather than
// depending on the seed script having run, and cleans them up afterwards.

let app: FastifyInstance;
let cookie: string;
let clientId: number;
let userId: number;

before(async () => {
  app = await buildApp();
  await app.ready();

  const email = `points-test-${Date.now()}@tcfp.test`;
  const passwordHash = await hashPassword("test-password-123");
  const { rows: userRows } = await pool.query<{ id: number }>(
    `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, 'Points Test Adviser', 'adviser') RETURNING id`,
    [email, passwordHash]
  );
  userId = userRows[0].id;

  const { rows: clientRows } = await pool.query<{ id: number }>(
    `INSERT INTO clients (first_names, surname, status, adviser_id, cm_id, review_cycle)
     VALUES ('Points Test', 'TESTCLIENT', 'Working', $1, $1, 'Annual') RETURNING id`,
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
  await pool.query(`DELETE FROM points WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM clients WHERE id = $1`, [clientId]);
  await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
  // Not deleting the user: audit_log.user_id references it and audit_log is
  // never cleaned up, by design, the same as it wouldn't be for real usage.
  // Deactivating is the same pattern the app itself uses instead of a hard
  // delete for users.
  await pool.query(`UPDATE users SET active = false WHERE id = $1`, [userId]);
  await app.close();
  await pool.end();
});

async function createPoint(text: string) {
  return app.inject({
    method: "POST",
    url: `/api/clients/${clientId}/points`,
    headers: { cookie },
    payload: { text },
  });
}

async function getSpine() {
  return app.inject({ method: "GET", url: `/api/clients/${clientId}`, headers: { cookie } });
}

test("assigns sequential numbers starting at 1", async () => {
  const r1 = await createPoint("First point");
  const r2 = await createPoint("Second point");
  const r3 = await createPoint("Third point");

  assert.equal(r1.json().number, 1);
  assert.equal(r2.json().number, 2);
  assert.equal(r3.json().number, 3);
});

test("concurrent creates on the same client never collide on a number", async () => {
  const before = await getSpine();
  const startingCount = before.json().points.length;

  const concurrency = 10;
  const responses = await Promise.all(
    Array.from({ length: concurrency }, (_, i) => createPoint(`Concurrent point ${i}`))
  );

  const numbers = responses.map((r) => {
    assert.equal(r.statusCode, 201, r.body);
    return r.json().number as number;
  });

  const uniqueNumbers = new Set(numbers);
  assert.equal(uniqueNumbers.size, concurrency, "every concurrent create must get a distinct number");

  const expected = new Set(
    Array.from({ length: concurrency }, (_, i) => startingCount + 1 + i)
  );
  assert.deepEqual(uniqueNumbers, expected, "numbers must be exactly the next N in sequence, no gaps or dupes");
});

test("rejects leaving 'open' without a resolution_note", async () => {
  const created = await createPoint("Needs a resolution note to carry");
  const { id } = created.json();

  const res = await app.inject({
    method: "PATCH",
    url: `/api/points/${id}`,
    headers: { cookie },
    payload: { status: "carried" },
  });

  assert.equal(res.statusCode, 400);
  assert.match(res.json().error, /resolution_note/);
});

test("carrying with a resolution_note succeeds and leaves resolved_by/resolved_at unset", async () => {
  const created = await createPoint("Will be carried forward");
  const { id } = created.json();

  const res = await app.inject({
    method: "PATCH",
    url: `/api/points/${id}`,
    headers: { cookie },
    payload: { status: "carried", resolution_note: "Carry forward — ran out of time." },
  });

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.status, "carried");
  assert.equal(body.resolution_note, "Carry forward — ran out of time.");
  assert.equal(body.resolved_by, null);
  assert.equal(body.resolved_at, null);
});

test("resolving with a resolution_note sets resolved_by and resolved_at", async () => {
  const created = await createPoint("Will be resolved");
  const { id } = created.json();

  const res = await app.inject({
    method: "PATCH",
    url: `/api/points/${id}`,
    headers: { cookie },
    payload: { status: "resolved", resolution_note: "Discussed and closed off." },
  });

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.status, "resolved");
  assert.equal(body.resolved_by, userId);
  assert.notEqual(body.resolved_at, null);
});

test("resolved and carried points stay visible in the client spine — nothing vanishes", async () => {
  const resolved = await createPoint("Resolve me for visibility check");
  await app.inject({
    method: "PATCH",
    url: `/api/points/${resolved.json().id}`,
    headers: { cookie },
    payload: { status: "resolved", resolution_note: "Closed." },
  });

  const carried = await createPoint("Carry me for visibility check");
  await app.inject({
    method: "PATCH",
    url: `/api/points/${carried.json().id}`,
    headers: { cookie },
    payload: { status: "carried", resolution_note: "Carried." },
  });

  const spine = await getSpine();
  const ids = spine.json().points.map((p: { id: number }) => p.id);
  assert.ok(ids.includes(resolved.json().id), "resolved point must still appear");
  assert.ok(ids.includes(carried.json().id), "carried point must still appear");
});

test("point numbers are never reused, even after resolving earlier ones", async () => {
  const before = await getSpine();
  const maxBefore = Math.max(0, ...before.json().points.map((p: { number: number }) => p.number));

  const toResolve = await createPoint("About to be resolved");
  await app.inject({
    method: "PATCH",
    url: `/api/points/${toResolve.json().id}`,
    headers: { cookie },
    payload: { status: "resolved", resolution_note: "Done." },
  });
  const resolvedNumber = toResolve.json().number;

  const next = await createPoint("Should not reuse the resolved number");
  assert.notEqual(next.json().number, resolvedNumber);
  assert.ok(next.json().number > maxBefore, "new number must continue the sequence, never reuse a freed one");
});

test("the DB itself refuses a non-open point with no resolution_note, independent of the API", async () => {
  const created = await createPoint("Direct SQL constraint check");
  const { id } = created.json();

  await assert.rejects(
    () => pool.query(`UPDATE points SET status = 'resolved', resolution_note = NULL WHERE id = $1`, [id]),
    (err: { code?: string }) => err.code === "23514"
  );
});

test("the DB itself refuses a duplicate (client_id, number) pair, independent of the API", async () => {
  const created = await createPoint("Duplicate number check");
  const { number } = created.json();

  await assert.rejects(
    () =>
      pool.query(`INSERT INTO points (client_id, number, text, status) VALUES ($1, $2, 'dup', 'open')`, [
        clientId,
        number,
      ]),
    (err: { code?: string }) => err.code === "23505"
  );
});
