import { randomUUID } from "node:crypto";
import path from "node:path";
import type { FastifyPluginAsync } from "fastify";
import { env } from "../env.js";
import { pool, withTransaction } from "../db.js";
import { recordAudit } from "../audit.js";
import { friendlyConstraintMessage } from "../dbErrors.js";
import { normalizeText } from "../textNormalize.js";
import { storage } from "../storage/index.js";

// Sensible allow-list for a financial advisory firm's client documents -
// not exhaustive, deliberately not permissive (no executables, archives,
// or scripts). A code constant rather than an env var: this is a security
// decision, not a deployment setting.
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
  "image/png",
  "image/jpeg",
]);

const ATTACHMENT_COLUMNS = `
  id, client_id, filename, content_type, size_bytes, note, uploaded_by, created_at
`;

// Strips anything that could break out of the quoted Content-Disposition
// value or inject a header/CRLF - the filename comes from the uploader,
// not from us.
function contentDispositionFilename(filename: string): string {
  const safe = filename.replace(/[\r\n"]/g, "").slice(0, 255);
  return `attachment; filename="${safe || "download"}"`;
}

const attachmentsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/api/clients/:id/attachments", async (request, reply) => {
    const clientId = Number((request.params as { id: string }).id);
    const userId = request.user!.id;

    const data = await request.file();
    if (!data) {
      reply.code(400).send({ error: "No file was uploaded." });
      return;
    }

    let buffer: Buffer;
    try {
      buffer = await data.toBuffer();
    } catch {
      reply
        .code(400)
        .send({ error: `File exceeds the ${Math.floor(env.MAX_UPLOAD_BYTES / (1024 * 1024))}MB limit.` });
      return;
    }

    if (!ALLOWED_MIME_TYPES.has(data.mimetype)) {
      reply.code(400).send({ error: `File type '${data.mimetype}' isn't allowed.` });
      return;
    }

    // Read after consuming the stream, per @fastify/multipart's own note -
    // fields aren't guaranteed populated until the file part is drained.
    const noteField = data.fields.note;
    const note =
      noteField && !Array.isArray(noteField) && noteField.type === "field" ? String(noteField.value) : null;

    const ext = path.extname(data.filename || "").slice(0, 10);
    const storageKey = `${randomUUID()}${ext}`;

    try {
      // Storage write happens before the DB row, and outside the
      // transaction: if the DB insert then fails, we're left with an
      // unreferenced file on disk (harmless, cleaned up by nothing today
      // but not a correctness problem). The other order - DB row first -
      // could leave a row pointing at a file that was never written,
      // which download would then 404 on. This way a row only ever
      // exists once its bytes are safely on disk.
      await storage.save(storageKey, buffer);

      const created = await withTransaction(async (tx) => {
        const { rows } = await tx.query(
          `INSERT INTO attachments (client_id, filename, storage_key, content_type, size_bytes, note, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING ${ATTACHMENT_COLUMNS}`,
          [clientId, data.filename, storageKey, data.mimetype, buffer.length, note ? normalizeText(note) : null, userId]
        );
        const row = rows[0];
        await recordAudit(tx, {
          userId,
          entityType: "attachment",
          entityId: row.id,
          action: "create",
          before: null,
          after: row,
        });
        return row;
      });
      reply.code(201);
      return created;
    } catch (err) {
      const message = friendlyConstraintMessage(err);
      if (message) {
        reply.code(400).send({ error: message });
        return;
      }
      throw err;
    }
  });

  // Not audited as a distinct "download" action - like every other GET
  // route in the app, reads aren't written to audit_log, only the
  // create/update/delete actions are (see recordAudit call sites).
  fastify.get("/api/attachments/:id/download", async (request, reply) => {
    const id = Number((request.params as { id: string }).id);

    const { rows } = await pool.query(
      `SELECT filename, storage_key, content_type FROM attachments WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (rows.length === 0) {
      reply.code(404).send({ error: "Attachment not found" });
      return;
    }
    const attachment = rows[0];

    let buffer: Buffer;
    try {
      buffer = await storage.read(attachment.storage_key);
    } catch {
      reply.code(404).send({ error: "The file for this attachment could not be found in storage." });
      return;
    }

    reply
      .header("Content-Type", attachment.content_type)
      .header("Content-Disposition", contentDispositionFilename(attachment.filename))
      .send(buffer);
  });

  fastify.delete("/api/attachments/:id", async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const userId = request.user!.id;

    // Soft delete only, same as every other table - the row and the
    // underlying file both stay in place. Deleting just hides it from the
    // list and blocks download.
    const result = await withTransaction(async (tx) => {
      const { rows: beforeRows } = await tx.query(
        `SELECT * FROM attachments WHERE id = $1 AND deleted_at IS NULL`,
        [id]
      );
      if (beforeRows.length === 0) return null;
      const before = beforeRows[0];

      const { rows: afterRows } = await tx.query(
        `UPDATE attachments SET deleted_at = now() WHERE id = $1 RETURNING *`,
        [id]
      );
      const after = afterRows[0];
      await recordAudit(tx, {
        userId,
        entityType: "attachment",
        entityId: id,
        action: "delete",
        before,
        after,
      });
      return after;
    });

    if (!result) {
      reply.code(404).send({ error: "Attachment not found" });
      return;
    }
    reply.code(204);
  });
};

export default attachmentsRoutes;
