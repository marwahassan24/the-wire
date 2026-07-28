import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { pool } from "../db.js";
import { hashPassword } from "../auth/password.js";

// Covers the auto-created-task path specifically: a saved meeting note's
// "TCFP:"/"Client:" lines become draft tasks, and every one of them must
// go through the same sense-check gate as any other automated producer
// (see tasks.test.ts) - never self-confirmed, always awaiting a human.

let app: FastifyInstance;
let cookie: string;
let clientId: number;
let adviserId: number;
let cmId: number;

before(async () => {
  app = await buildApp();
  await app.ready();

  const email = `meeting-notes-test-${Date.now()}@tcfp.test`;
  const passwordHash = await hashPassword("test-password-123");
  const { rows: adviserRows } = await pool.query<{ id: number }>(
    `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, 'MN Test Adviser', 'adviser') RETURNING id`,
    [email, passwordHash]
  );
  adviserId = adviserRows[0].id;

  const { rows: cmRows } = await pool.query<{ id: number }>(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, $2, 'MN Test CM', 'client_manager') RETURNING id`,
    [`meeting-notes-cm-${Date.now()}@tcfp.test`, passwordHash]
  );
  cmId = cmRows[0].id;

  const { rows: clientRows } = await pool.query<{ id: number }>(
    `INSERT INTO clients (first_names, surname, status, adviser_id, cm_id, review_cycle)
     VALUES ('Meeting Notes Test', 'TESTCLIENT', 'Working', $1, $2, 'Annual') RETURNING id`,
    [adviserId, cmId]
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
  await pool.query(`DELETE FROM clients WHERE id = $1`, [clientId]);
  await pool.query(`DELETE FROM sessions WHERE user_id IN ($1, $2)`, [adviserId, cmId]);
  await pool.query(`UPDATE users SET active = false WHERE id IN ($1, $2)`, [adviserId, cmId]);
  await app.close();
  await pool.end();
});

async function createNote(body: string, overrides: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST",
    url: `/api/clients/${clientId}/meeting-notes`,
    headers: { cookie },
    payload: { meeting_date: "2026-06-01", meeting_type: "Interim", body, ...overrides },
  });
}

async function patchNote(id: number, payload: Record<string, unknown>) {
  return app.inject({ method: "PATCH", url: `/api/meeting-notes/${id}`, headers: { cookie }, payload });
}

test("TCFP: and Client: lines each produce a task, correctly worded, owned by the CM, awaiting sense-check", async () => {
  const body = "Overall position\nFine.\n\nNext steps & actions\nTCFP: confirm the DD position.\nClient: send the booklet when it arrives.";
  const res = await createNote(body);
  assert.equal(res.statusCode, 201);
  const note = res.json();
  assert.equal(note.tasks.length, 2);

  const tcfpTask = note.tasks.find((t: { text: string }) => t.text === "confirm the DD position.");
  assert.ok(tcfpTask, "TCFP: line should produce a task with the prefix stripped");

  const clientTask = note.tasks.find((t: { text: string }) =>
    t.text === "Client action - send the booklet when it arrives."
  );
  assert.ok(clientTask, "Client: line should produce a task worded as our follow-up");

  for (const t of note.tasks) {
    assert.equal(t.status, "awaiting_sense_check");
    assert.equal(t.owner_name, "MN Test CM");
  }

  const { rows } = await pool.query(
    `SELECT owner_id, source, status, meeting_note_id, confirmed_by FROM tasks WHERE id = $1`,
    [tcfpTask.id]
  );
  assert.equal(rows[0].owner_id, cmId);
  assert.equal(rows[0].source, "meeting_note");
  assert.equal(rows[0].status, "awaiting_sense_check");
  assert.equal(rows[0].meeting_note_id, note.id);
  assert.equal(rows[0].confirmed_by, null);
});

test("a note with no action lines produces no tasks", async () => {
  const res = await createNote("Overall position\nA quiet meeting, nothing further needed.");
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.json().tasks, []);
});

test("narrative mentions of 'client' or 'tcfp' without a leading label don't produce tasks", async () => {
  const res = await createNote("We discussed what TCFP offers.\nThe client seemed reassured.");
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.json().tasks, []);
});

test("re-saving an edited draft with an unchanged action line does not duplicate its task", async () => {
  const created = await createNote("Next steps & actions\nTCFP: prepare the comparison.");
  const note = created.json();
  assert.equal(note.tasks.length, 1);
  const originalTaskId = note.tasks[0].id;

  // Edit something else about the note but keep the same action line.
  const edited = await patchNote(note.id, {
    body: "Updated narrative.\n\nNext steps & actions\nTCFP: prepare the comparison.",
  });
  assert.equal(edited.statusCode, 200);
  const editedNote = edited.json();
  assert.equal(editedNote.tasks.length, 1, "the same line should not produce a second task");
  assert.equal(editedNote.tasks[0].id, originalTaskId, "it should be the very same task, not a new one");
});

test("editing a draft to change a line's wording adds a new task without removing the old one", async () => {
  const created = await createNote("Next steps & actions\nTCFP: original wording.");
  const note = created.json();
  const originalTaskId = note.tasks[0].id;

  const edited = await patchNote(note.id, {
    body: "Next steps & actions\nTCFP: revised wording.",
  });
  const editedNote = edited.json();
  assert.equal(editedNote.tasks.length, 2, "changed wording is a new candidate, not a match for the old one");
  const texts = editedNote.tasks.map((t: { text: string }) => t.text).sort();
  assert.deepEqual(texts, ["original wording.", "revised wording."]);

  const stillThere = editedNote.tasks.find((t: { id: number }) => t.id === originalTaskId);
  assert.ok(stillThere, "the task from the original wording must not be deleted or altered");
});

test("editing a draft to add a new action line creates exactly one new task", async () => {
  const created = await createNote("Next steps & actions\nTCFP: first item.");
  const note = created.json();
  assert.equal(note.tasks.length, 1);

  const edited = await patchNote(note.id, {
    body: "Next steps & actions\nTCFP: first item.\nClient: second item.",
  });
  const editedNote = edited.json();
  assert.equal(editedNote.tasks.length, 2);
});

test("approving a note without changing its body does not touch its tasks", async () => {
  const created = await createNote("Next steps & actions\nTCFP: something to do.");
  const note = created.json();
  const taskId = note.tasks[0].id;

  const approved = await patchNote(note.id, { status: "approved" });
  assert.equal(approved.statusCode, 200);
  assert.equal(approved.json().status, "approved");
  assert.equal(approved.json().tasks.length, 1);
  assert.equal(approved.json().tasks[0].id, taskId);
});

test("an approved note can no longer be edited, so its action lines can't be re-parsed after sign-off", async () => {
  const created = await createNote("Next steps & actions\nTCFP: pre-approval item.");
  const note = created.json();
  await patchNote(note.id, { status: "approved" });

  const res = await patchNote(note.id, { body: "Next steps & actions\nTCFP: pre-approval item.\nTCFP: new item." });
  assert.equal(res.statusCode, 400);

  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM tasks WHERE meeting_note_id = $1`, [note.id]);
  assert.equal(rows[0].n, 1, "the blocked edit must not have created a task for the new line");
});

test("the sense-check gate applies to auto-created tasks exactly as it does everywhere else", async () => {
  const created = await createNote("Next steps & actions\nTCFP: gate check.");
  const taskId = created.json().tasks[0].id;

  const doneAttempt = await app.inject({
    method: "PATCH",
    url: `/api/tasks/${taskId}`,
    headers: { cookie },
    payload: { status: "done" },
  });
  assert.equal(doneAttempt.statusCode, 400, "cannot be marked done before a human confirms it");

  const confirmed = await app.inject({
    method: "PATCH",
    url: `/api/tasks/${taskId}`,
    headers: { cookie },
    payload: { status: "confirmed" },
  });
  assert.equal(confirmed.statusCode, 200);
  assert.equal(confirmed.json().status, "confirmed");
  assert.notEqual(confirmed.json().confirmed_by, null);

  const done = await app.inject({
    method: "PATCH",
    url: `/api/tasks/${taskId}`,
    headers: { cookie },
    payload: { status: "done" },
  });
  assert.equal(done.statusCode, 200);
});

test("each auto-created task has its own create audit entry", async () => {
  const created = await createNote("Next steps & actions\nTCFP: audited item.\nClient: audited client item.");
  const note = created.json();
  assert.equal(note.tasks.length, 2);

  for (const t of note.tasks) {
    const { rows } = await pool.query(
      `SELECT action FROM audit_log WHERE entity_type = 'task' AND entity_id = $1`,
      [t.id]
    );
    assert.deepEqual(rows.map((r) => r.action), ["create"]);
  }
});

test("GET /api/clients/:id bundles each note's auto-created tasks onto it", async () => {
  const created = await createNote("Next steps & actions\nTCFP: bundled item.");
  const note = created.json();

  const bundle = await app.inject({ method: "GET", url: `/api/clients/${clientId}`, headers: { cookie } });
  assert.equal(bundle.statusCode, 200);
  const bundledNote = bundle.json().meetingNotes.find((n: { id: number }) => n.id === note.id);
  assert.ok(bundledNote);
  assert.equal(bundledNote.tasks.length, 1);
  assert.equal(bundledNote.tasks[0].text, "bundled item.");
});
