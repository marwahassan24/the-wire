import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { pool } from "../db.js";
import { hashPassword } from "../auth/password.js";

// The prep pack is the daily-use feature: one call returning open/carried
// points (with history), recent soft facts, portfolio summary + recent
// log, outstanding tasks, and the last meeting note. This is what makes
// "a point raised in one meeting reliably surfaces in the next meeting's
// prep" (the definition-of-done item) actually true.

let app: FastifyInstance;
let cookie: string;
let clientId: number;
let userId: number;

before(async () => {
  app = await buildApp();
  await app.ready();

  const email = `prep-test-${Date.now()}@tcfp.test`;
  const passwordHash = await hashPassword("test-password-123");
  const { rows: userRows } = await pool.query<{ id: number }>(
    `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, 'Prep Test Adviser', 'adviser') RETURNING id`,
    [email, passwordHash]
  );
  userId = userRows[0].id;

  const { rows: clientRows } = await pool.query<{ id: number }>(
    `INSERT INTO clients (first_names, surname, status, adviser_id, cm_id, review_cycle)
     VALUES ('Prep Test', 'TESTCLIENT', 'Working', $1, $1, 'Annual') RETURNING id`,
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
  await pool.query(`DELETE FROM meeting_notes WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM portfolio_log WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM portfolio_summary WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM points WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM soft_facts WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM clients WHERE id = $1`, [clientId]);
  await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
  await pool.query(`UPDATE users SET active = false WHERE id = $1`, [userId]);
  await app.close();
  await pool.end();
});

async function getPrep() {
  return app.inject({ method: "GET", url: `/api/clients/${clientId}/prep`, headers: { cookie } });
}

test("404s for a client that doesn't exist", async () => {
  const res = await app.inject({ method: "GET", url: "/api/clients/999999/prep", headers: { cookie } });
  assert.equal(res.statusCode, 404);
});

test("includes open and carried points, excludes resolved ones", async () => {
  const open = await app.inject({
    method: "POST",
    url: `/api/clients/${clientId}/points`,
    headers: { cookie },
    payload: { text: "Open point" },
  });
  const carried = await app.inject({
    method: "POST",
    url: `/api/clients/${clientId}/points`,
    headers: { cookie },
    payload: { text: "Carried point" },
  });
  const resolved = await app.inject({
    method: "POST",
    url: `/api/clients/${clientId}/points`,
    headers: { cookie },
    payload: { text: "Resolved point" },
  });
  await app.inject({
    method: "PATCH",
    url: `/api/points/${carried.json().id}`,
    headers: { cookie },
    payload: { status: "carried", resolution_note: "No time." },
  });
  await app.inject({
    method: "PATCH",
    url: `/api/points/${resolved.json().id}`,
    headers: { cookie },
    payload: { status: "resolved", resolution_note: "Done." },
  });

  const res = await getPrep();
  assert.equal(res.statusCode, 200);
  const ids = res.json().points.map((p: { id: number }) => p.id);
  assert.ok(ids.includes(open.json().id), "open point must appear");
  assert.ok(ids.includes(carried.json().id), "carried point must appear, with its history");
  assert.ok(!ids.includes(resolved.json().id), "resolved point must not appear in prep");

  const carriedInPrep = res.json().points.find((p: { id: number }) => p.id === carried.json().id);
  assert.equal(carriedInPrep.resolution_note, "No time.");
});

test("caps recent soft facts at 5, newest first", async () => {
  for (let i = 1; i <= 7; i++) {
    await app.inject({
      method: "POST",
      url: `/api/clients/${clientId}/soft-facts`,
      headers: { cookie },
      payload: { text: `Fact ${i}`, fact_date: `2026-01-0${i}` },
    });
  }

  const res = await getPrep();
  const facts = res.json().recentSoftFacts;
  assert.equal(facts.length, 5);
  assert.equal(facts[0].text, "Fact 7");
  assert.equal(facts[4].text, "Fact 3");
});

test("caps the recent portfolio log at 5 and includes the current summary", async () => {
  await app.inject({
    method: "PUT",
    url: `/api/clients/${clientId}/portfolio`,
    headers: { cookie },
    payload: { summary: "Current portfolio summary text." },
  });
  for (let i = 1; i <= 7; i++) {
    await app.inject({
      method: "POST",
      url: `/api/clients/${clientId}/portfolio-log`,
      headers: { cookie },
      payload: { text: `Log entry ${i}`, entry_date: `2026-02-0${i}` },
    });
  }

  const res = await getPrep();
  const portfolio = res.json().portfolio;
  assert.equal(portfolio.summary, "Current portfolio summary text.");
  assert.equal(portfolio.recentLogs.length, 5);
  assert.equal(portfolio.recentLogs[0].text, "Log entry 7");
});

test("outstanding tasks excludes done, includes awaiting_sense_check and confirmed", async () => {
  const manual = await app.inject({
    method: "POST",
    url: `/api/clients/${clientId}/tasks`,
    headers: { cookie },
    payload: { text: "Manual confirmed task", owner_id: userId },
  });
  const sync = await app.inject({
    method: "POST",
    url: `/api/clients/${clientId}/tasks`,
    headers: { cookie },
    payload: { text: "Sync awaiting task", owner_id: userId, source: "sync" },
  });
  const done = await app.inject({
    method: "POST",
    url: `/api/clients/${clientId}/tasks`,
    headers: { cookie },
    payload: { text: "Done task", owner_id: userId },
  });
  await app.inject({
    method: "PATCH",
    url: `/api/tasks/${done.json().id}`,
    headers: { cookie },
    payload: { status: "done" },
  });

  const res = await getPrep();
  const ids = res.json().outstandingTasks.map((t: { id: number }) => t.id);
  assert.ok(ids.includes(manual.json().id));
  assert.ok(ids.includes(sync.json().id));
  assert.ok(!ids.includes(done.json().id), "a done task must not count as outstanding");
});

test("returns only the single most recent meeting note", async () => {
  await app.inject({
    method: "POST",
    url: `/api/clients/${clientId}/meeting-notes`,
    headers: { cookie },
    payload: { meeting_date: "2025-01-01", meeting_type: "Annual", body: "Older note." },
  });
  const newer = await app.inject({
    method: "POST",
    url: `/api/clients/${clientId}/meeting-notes`,
    headers: { cookie },
    payload: { meeting_date: "2026-06-01", meeting_type: "Interim", body: "Newer note." },
  });

  const res = await getPrep();
  const note = res.json().lastMeetingNote;
  assert.equal(note.id, newer.json().id);
  assert.equal(note.body, "Newer note.");
});

test("soft-deleted points, soft facts, tasks, and meeting notes are excluded", async () => {
  const point = await app.inject({
    method: "POST",
    url: `/api/clients/${clientId}/points`,
    headers: { cookie },
    payload: { text: "To be soft-deleted" },
  });
  await pool.query(`UPDATE points SET deleted_at = now() WHERE id = $1`, [point.json().id]);

  const res = await getPrep();
  const ids = res.json().points.map((p: { id: number }) => p.id);
  assert.ok(!ids.includes(point.json().id));
});
