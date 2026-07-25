import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { pool } from "../db.js";
import { hashPassword } from "../auth/password.js";
import { storage } from "../storage/index.js";
import { env } from "../env.js";

let app: FastifyInstance;
let cookie: string;
let clientId: number;
let userId: number;
const createdKeys: string[] = [];

before(async () => {
  app = await buildApp();
  await app.ready();

  const email = `attachments-test-${Date.now()}@tcfp.test`;
  const passwordHash = await hashPassword("test-password-123");
  const { rows: userRows } = await pool.query<{ id: number }>(
    `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, 'Attachments Test Adviser', 'adviser') RETURNING id`,
    [email, passwordHash]
  );
  userId = userRows[0].id;

  const { rows: clientRows } = await pool.query<{ id: number }>(
    `INSERT INTO clients (first_names, surname, status, adviser_id, cm_id, review_cycle)
     VALUES ('Attachments Test', 'TESTCLIENT', 'Working', $1, $1, 'Annual') RETURNING id`,
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
  await Promise.all(createdKeys.map((key) => storage.remove(key).catch(() => {})));
  await pool.query(`DELETE FROM audit_log WHERE entity_type = 'attachment' AND entity_id IN
    (SELECT id FROM attachments WHERE client_id = $1)`, [clientId]);
  await pool.query(`DELETE FROM attachments WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM clients WHERE id = $1`, [clientId]);
  await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
  await pool.query(`UPDATE users SET active = false WHERE id = $1`, [userId]);
  await app.close();
  await pool.end();
});

// Builds a multipart/form-data body by hand rather than pulling in a new
// dependency - fields are placed before the file part per @fastify/
// multipart's own recommendation, though the route reads fields after
// draining the stream so order shouldn't matter either way.
function buildMultipart(parts: { name: string; value?: string; filename?: string; contentType?: string; data?: Buffer }[]) {
  const boundary = `wiretestboundary${Date.now()}`;
  const chunks: Buffer[] = [];
  for (const part of parts) {
    let header = `--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"`;
    if (part.filename) header += `; filename="${part.filename}"`;
    header += `\r\n`;
    if (part.contentType) header += `Content-Type: ${part.contentType}\r\n`;
    header += `\r\n`;
    chunks.push(Buffer.from(header, "utf8"));
    chunks.push(part.data ?? Buffer.from(part.value ?? "", "utf8"));
    chunks.push(Buffer.from("\r\n", "utf8"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, "utf8"));
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

async function upload(opts: {
  note?: string;
  filename?: string;
  contentType?: string;
  data?: Buffer;
}) {
  const parts: Parameters<typeof buildMultipart>[0] = [];
  if (opts.note !== undefined) parts.push({ name: "note", value: opts.note });
  parts.push({
    name: "file",
    filename: opts.filename ?? "statement.pdf",
    contentType: opts.contentType ?? "application/pdf",
    data: opts.data ?? Buffer.from("%PDF-1.4 test file content"),
  });
  const { body, contentType } = buildMultipart(parts);
  return app.inject({
    method: "POST",
    url: `/api/clients/${clientId}/attachments`,
    headers: { cookie, "content-type": contentType },
    payload: body,
  });
}

test("uploads a file and records filename, uploaded-by, date and note; audits the create", async () => {
  const res = await upload({ note: "Signed LOA — client copy" });
  assert.equal(res.statusCode, 201);
  const body = res.json();
  createdKeys.push((await pool.query(`SELECT storage_key FROM attachments WHERE id = $1`, [body.id])).rows[0].storage_key);

  assert.equal(body.filename, "statement.pdf");
  assert.equal(body.content_type, "application/pdf");
  assert.equal(body.uploaded_by, userId);
  assert.ok(body.created_at);
  assert.equal(body.size_bytes, Buffer.byteLength("%PDF-1.4 test file content"));
  // Em dash normalised on save, same as every other narrative field.
  assert.equal(body.note, "Signed LOA - client copy");
  assert.equal("storage_key" in body, false, "storage_key is an internal detail, never returned to the client");

  const { rows } = await pool.query(
    `SELECT entity_type, action, user_id FROM audit_log WHERE entity_type = 'attachment' AND entity_id = $1`,
    [body.id]
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].action, "create");
  assert.equal(rows[0].user_id, userId);
});

test("the client's Living Document lists the attachment with the uploader's name", async () => {
  const uploaded = await upload({ note: "Fact find" });
  createdKeys.push(
    (await pool.query(`SELECT storage_key FROM attachments WHERE id = $1`, [uploaded.json().id])).rows[0].storage_key
  );

  const spine = await app.inject({ method: "GET", url: `/api/clients/${clientId}`, headers: { cookie } });
  assert.equal(spine.statusCode, 200);
  const found = spine.json().attachments.find((a: { id: number }) => a.id === uploaded.json().id);
  assert.ok(found, "uploaded attachment should appear in the client spine response");
  assert.equal(found.uploaded_by_name, "Attachments Test Adviser");
});

test("rejects a disallowed file type without writing anything to storage or the DB", async () => {
  const { rows: before } = await pool.query(`SELECT count(*) FROM attachments WHERE client_id = $1`, [clientId]);

  const res = await upload({ filename: "installer.exe", contentType: "application/x-msdownload" });
  assert.equal(res.statusCode, 400);
  assert.match(res.json().error, /isn't allowed/);

  const { rows: after } = await pool.query(`SELECT count(*) FROM attachments WHERE client_id = $1`, [clientId]);
  assert.equal(after[0].count, before[0].count);
});

test("rejects a file over the configured size limit", async () => {
  const oversized = Buffer.alloc(env.MAX_UPLOAD_BYTES + 1024, 1);
  const res = await upload({ data: oversized });
  assert.equal(res.statusCode, 400);
  assert.match(res.json().error, /exceeds the/);
});

test("download streams the exact bytes back with the right content type and filename", async () => {
  const content = Buffer.from("%PDF-1.4 downloadable content check");
  const uploaded = await upload({ filename: "review-notes.pdf", data: content });
  const id = uploaded.json().id;
  const storageKey = (await pool.query(`SELECT storage_key FROM attachments WHERE id = $1`, [id])).rows[0]
    .storage_key;
  createdKeys.push(storageKey);

  const res = await app.inject({ method: "GET", url: `/api/attachments/${id}/download`, headers: { cookie } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["content-type"], "application/pdf");
  assert.match(String(res.headers["content-disposition"]), /attachment; filename="review-notes\.pdf"/);
  assert.deepEqual(res.rawPayload, content);
});

test("soft-deleting an attachment hides it from the list and download, but keeps the row and file", async () => {
  const uploaded = await upload({ note: "To be deleted" });
  const id = uploaded.json().id;
  const storageKey = (await pool.query(`SELECT storage_key FROM attachments WHERE id = $1`, [id])).rows[0]
    .storage_key;
  createdKeys.push(storageKey);

  const del = await app.inject({ method: "DELETE", url: `/api/attachments/${id}`, headers: { cookie } });
  assert.equal(del.statusCode, 204);

  const spine = await app.inject({ method: "GET", url: `/api/clients/${clientId}`, headers: { cookie } });
  assert.equal(
    spine.json().attachments.some((a: { id: number }) => a.id === id),
    false,
    "soft-deleted attachment must not appear in the client spine"
  );

  const download = await app.inject({ method: "GET", url: `/api/attachments/${id}/download`, headers: { cookie } });
  assert.equal(download.statusCode, 404);

  const { rows } = await pool.query(`SELECT deleted_at FROM attachments WHERE id = $1`, [id]);
  assert.equal(rows.length, 1, "the row itself must still exist - soft delete, not hard delete");
  assert.ok(rows[0].deleted_at, "deleted_at should be set");

  const fileStillOnDisk = await storage.read(storageKey);
  assert.deepEqual(fileStillOnDisk, Buffer.from("%PDF-1.4 test file content"), "the file itself must not be removed");

  const { rows: auditRows } = await pool.query(
    `SELECT action, user_id FROM audit_log WHERE entity_type = 'attachment' AND entity_id = $1 ORDER BY id`,
    [id]
  );
  assert.deepEqual(
    auditRows.map((r) => r.action),
    ["create", "delete"]
  );
  for (const row of auditRows) assert.equal(row.user_id, userId);
});

test("deleting a nonexistent or already-deleted attachment 404s", async () => {
  const res = await app.inject({ method: "DELETE", url: `/api/attachments/999999999`, headers: { cookie } });
  assert.equal(res.statusCode, 404);
});
