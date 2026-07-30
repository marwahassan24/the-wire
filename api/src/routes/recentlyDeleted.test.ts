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
let userName: string;

before(async () => {
  app = await buildApp();
  await app.ready();

  userName = "Recently Deleted Test Adviser";
  const email = `recently-deleted-test-${Date.now()}@tcfp.test`;
  const passwordHash = await hashPassword("test-password-123");
  const { rows: userRows } = await pool.query<{ id: number }>(
    `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, 'adviser') RETURNING id`,
    [email, passwordHash, userName]
  );
  userId = userRows[0].id;

  const { rows: clientRows } = await pool.query<{ id: number }>(
    `INSERT INTO clients (first_names, surname, status, adviser_id, cm_id, review_cycle)
     VALUES ('Recently Deleted Test', 'TESTCLIENT', 'Working', $1, $1, 'Annual') RETURNING id`,
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
  await pool.query(`DELETE FROM attachments WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM contact_log WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM soft_facts WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM clients WHERE id = $1`, [clientId]);
  await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
  await pool.query(`UPDATE users SET active = false WHERE id = $1`, [userId]);
  await app.close();
  await pool.end();
});

async function recentlyDeleted() {
  const res = await app.inject({
    method: "GET",
    url: `/api/clients/${clientId}/recently-deleted`,
    headers: { cookie },
  });
  return res.json() as {
    entity_type: string;
    entity_id: number;
    section: string;
    summary: string;
    meta: string | null;
    deleted_by_name: string | null;
  }[];
}

test("a soft-deleted soft fact appears in the client's recently-deleted list with who deleted it", async () => {
  const created = await app.inject({
    method: "POST",
    url: `/api/clients/${clientId}/soft-facts`,
    headers: { cookie },
    payload: { text: "Loves sailing." },
  });
  const id = created.json().id;

  const del = await app.inject({ method: "DELETE", url: `/api/soft-facts/${id}`, headers: { cookie } });
  assert.equal(del.statusCode, 204);

  const items = await recentlyDeleted();
  const item = items.find((i) => i.entity_type === "soft_fact" && i.entity_id === id);
  assert.ok(item, "the deleted soft fact should be in the recently-deleted list");
  assert.equal(item!.section, "Soft facts");
  assert.equal(item!.summary, "Loves sailing.");
  assert.equal(item!.deleted_by_name, userName);
});

test("restoring puts the soft fact back exactly as it was, off the deleted list, and logs a restore audit entry", async () => {
  const created = await app.inject({
    method: "POST",
    url: `/api/clients/${clientId}/soft-facts`,
    headers: { cookie },
    payload: { text: "Restorable fact." },
  });
  const id = created.json().id;
  await app.inject({ method: "DELETE", url: `/api/soft-facts/${id}`, headers: { cookie } });

  const restore = await app.inject({
    method: "POST",
    url: `/api/recently-deleted/soft_fact/${id}/restore`,
    headers: { cookie },
  });
  assert.equal(restore.statusCode, 200);
  assert.equal(restore.json().text, "Restorable fact.");
  assert.equal(restore.json().deleted_at, null);

  const bundle = await app.inject({ method: "GET", url: `/api/clients/${clientId}`, headers: { cookie } });
  assert.ok(bundle.json().softFacts.some((f: { id: number }) => f.id === id), "restored fact should be back in the bundle");

  const items = await recentlyDeleted();
  assert.ok(!items.some((i) => i.entity_type === "soft_fact" && i.entity_id === id));

  const { rows } = await pool.query(
    `SELECT action FROM audit_log WHERE entity_type = 'soft_fact' AND entity_id = $1 ORDER BY id`,
    [id]
  );
  assert.deepEqual(rows.map((r) => r.action), ["create", "delete", "restore"]);
});

test("restoring something already restored, or that never existed, returns 404", async () => {
  const created = await app.inject({
    method: "POST",
    url: `/api/clients/${clientId}/soft-facts`,
    headers: { cookie },
    payload: { text: "Never actually deleted." },
  });
  const id = created.json().id;

  const restoreNotDeleted = await app.inject({
    method: "POST",
    url: `/api/recently-deleted/soft_fact/${id}/restore`,
    headers: { cookie },
  });
  assert.equal(restoreNotDeleted.statusCode, 404);

  const restoreMissing = await app.inject({
    method: "POST",
    url: `/api/recently-deleted/soft_fact/999999999/restore`,
    headers: { cookie },
  });
  assert.equal(restoreMissing.statusCode, 404);
});

test("restoring an unknown entity type is rejected", async () => {
  const res = await app.inject({
    method: "POST",
    url: `/api/recently-deleted/tasks/1/restore`,
    headers: { cookie },
  });
  assert.equal(res.statusCode, 400);
});

test("deleted contact log entries, attachments, and outstanding items all appear correctly, and each restores", async () => {
  const contactRes = await app.inject({
    method: "POST",
    url: `/api/clients/${clientId}/contact-log`,
    headers: { cookie },
    payload: { type: "call", staff_id: userId, note: "Rang about the ISA top-up." },
  });
  const contactId = contactRes.json().id;
  await app.inject({ method: "DELETE", url: `/api/contact-log/${contactId}`, headers: { cookie } });

  const outstandingRes = await app.inject({
    method: "POST",
    url: `/api/clients/${clientId}/outstanding-items`,
    headers: { cookie },
    payload: { type: "loa", description: "LOA for the old provider.", owner_id: userId },
  });
  const outstandingId = outstandingRes.json().id;
  await app.inject({ method: "DELETE", url: `/api/outstanding-items/${outstandingId}`, headers: { cookie } });

  // Inserted directly rather than through the multipart upload route -
  // attachments.test.ts already covers upload/delete itself; this only
  // needs a soft-deleted row with a matching audit 'delete' entry, same
  // shape the real route produces.
  const { rows: attachmentRows } = await pool.query<{ id: number }>(
    `INSERT INTO attachments (client_id, filename, storage_key, content_type, size_bytes, uploaded_by, deleted_at)
     VALUES ($1, 'statement.pdf', 'test-key', 'application/pdf', 1024, $2, now())
     RETURNING id`,
    [clientId, userId]
  );
  const attachmentId = attachmentRows[0].id;
  await pool.query(
    `INSERT INTO audit_log (user_id, entity_type, entity_id, action) VALUES ($1, 'attachment', $2, 'delete')`,
    [userId, attachmentId]
  );

  const items = await recentlyDeleted();
  const contactItem = items.find((i) => i.entity_type === "contact_log" && i.entity_id === contactId);
  assert.ok(contactItem);
  assert.equal(contactItem!.section, "Contact log");
  assert.equal(contactItem!.summary, "Rang about the ISA top-up.");

  const outstandingItem = items.find((i) => i.entity_type === "outstanding_item" && i.entity_id === outstandingId);
  assert.ok(outstandingItem);
  assert.equal(outstandingItem!.section, "Outstanding items");
  assert.equal(outstandingItem!.summary, "LOA for the old provider.");

  const attachmentItem = items.find((i) => i.entity_type === "attachment" && i.entity_id === attachmentId);
  assert.ok(attachmentItem);
  assert.equal(attachmentItem!.section, "Documents");
  assert.equal(attachmentItem!.summary, "statement.pdf");
  assert.equal(attachmentItem!.deleted_by_name, userName);

  for (const [entityType, id] of [
    ["contact_log", contactId],
    ["outstanding_item", outstandingId],
    ["attachment", attachmentId],
  ] as const) {
    const restore = await app.inject({
      method: "POST",
      url: `/api/recently-deleted/${entityType}/${id}/restore`,
      headers: { cookie },
    });
    assert.equal(restore.statusCode, 200, `${entityType} should restore cleanly`);
  }
});

test("the overall /api/recently-deleted view (not tied to a client) is empty - every deletable table requires a client_id today", async () => {
  const res = await app.inject({ method: "GET", url: `/api/recently-deleted`, headers: { cookie } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), []);
});
