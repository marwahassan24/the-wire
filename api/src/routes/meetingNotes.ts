import type { FastifyPluginAsync } from "fastify";
import type { PoolClient } from "pg";
import { withTransaction } from "../db.js";
import { recordAudit } from "../audit.js";
import { friendlyConstraintMessage } from "../dbErrors.js";
import { normalizeText } from "../textNormalize.js";
import { extractActionLines, taskTextForAction } from "../meetingNoteActions.js";

const createMeetingNoteSchema = {
  body: {
    type: "object",
    required: ["meeting_date", "meeting_type", "body"],
    properties: {
      meeting_date: { type: "string", format: "date" },
      meeting_type: { type: "string", enum: ["Annual", "Interim", "Ad hoc"] },
      body: { type: "string", minLength: 1 },
    },
    additionalProperties: false,
  },
};

const patchMeetingNoteSchema = {
  body: {
    type: "object",
    properties: {
      meeting_date: { type: "string", format: "date" },
      meeting_type: { type: "string", enum: ["Annual", "Interim", "Ad hoc"] },
      body: { type: "string", minLength: 1 },
      status: { type: "string", enum: ["approved"] },
    },
    additionalProperties: false,
  },
};

// Turns a saved note's "TCFP:"/"Client:" lines into draft tasks, owned by
// the client's CM by default. Every one lands awaiting_sense_check with
// source='meeting_note' - the same gate every other automated producer
// goes through (see tasks.ts's startsConfirmed check) - so this never
// bypasses the human sense-check, it just feeds it. Dedupes against any
// task already linked to this note by exact text, so re-saving an edited
// draft doesn't recreate lines that already produced one.
async function syncTasksFromNote(
  tx: PoolClient,
  clientId: number,
  note: { id: number; body: string },
  userId: number
): Promise<void> {
  const actions = extractActionLines(note.body);
  if (actions.length === 0) return;

  const { rows: clientRows } = await tx.query<{ cm_id: number }>(`SELECT cm_id FROM clients WHERE id = $1`, [
    clientId,
  ]);
  const cmId = clientRows[0]?.cm_id;
  if (!cmId) return;

  const { rows: existingRows } = await tx.query<{ text: string }>(
    `SELECT text FROM tasks WHERE meeting_note_id = $1`,
    [note.id]
  );
  const existingTexts = new Set(existingRows.map((r) => r.text));

  for (const action of actions) {
    const text = normalizeText(taskTextForAction(action));
    if (existingTexts.has(text)) continue;
    existingTexts.add(text);

    const { rows } = await tx.query(
      `INSERT INTO tasks (client_id, text, owner_id, source, status, meeting_note_id)
       VALUES ($1, $2, $3, 'meeting_note', 'awaiting_sense_check', $4)
       RETURNING id, client_id, text, owner_id, due_date, status, source,
                 confirmed_by, confirmed_at, meeting_note_id, created_at`,
      [clientId, text, cmId, note.id]
    );
    const row = rows[0];
    await recordAudit(tx, {
      userId,
      entityType: "task",
      entityId: row.id,
      action: "create",
      before: null,
      after: row,
    });
  }
}

async function tasksForNote(tx: PoolClient, noteId: number) {
  const { rows } = await tx.query(
    `SELECT t.id, t.text, t.status, t.owner_id, u.name AS owner_name
       FROM tasks t
       JOIN users u ON u.id = t.owner_id
      WHERE t.meeting_note_id = $1 AND t.deleted_at IS NULL
      ORDER BY t.created_at`,
    [noteId]
  );
  return rows;
}

const meetingNotesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/api/clients/:id/meeting-notes", { schema: createMeetingNoteSchema }, async (request, reply) => {
    const clientId = Number((request.params as { id: string }).id);
    const body = request.body as { meeting_date: string; meeting_type: string; body: string };
    const userId = request.user!.id;

    try {
      const created = await withTransaction(async (tx) => {
        const { rows } = await tx.query(
          `INSERT INTO meeting_notes (client_id, meeting_date, meeting_type, body, author_id)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, client_id, meeting_date, meeting_type, body, author_id,
                     status, approved_by, approved_at, created_at`,
          [clientId, body.meeting_date, body.meeting_type, normalizeText(body.body), userId]
        );
        const row = rows[0];
        await recordAudit(tx, {
          userId,
          entityType: "meeting_note",
          entityId: row.id,
          action: "create",
          before: null,
          after: row,
        });

        await syncTasksFromNote(tx, clientId, row, userId);
        const tasks = await tasksForNote(tx, row.id);
        return { ...row, tasks };
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

  fastify.patch("/api/meeting-notes/:id", { schema: patchMeetingNoteSchema }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const body = request.body as {
      meeting_date?: string;
      meeting_type?: string;
      body?: string;
      status?: "approved";
    };
    const userId = request.user!.id;

    try {
      const result = await withTransaction(async (tx) => {
        const { rows: beforeRows } = await tx.query(
          `SELECT * FROM meeting_notes WHERE id = $1 AND deleted_at IS NULL`,
          [id]
        );
        if (beforeRows.length === 0) return { kind: "not_found" as const };
        const before = beforeRows[0];

        // Approved notes are client-visible; editing one silently after
        // approval would defeat the human sign-off. Once approved, this
        // endpoint only accepts no-op/empty patches, never new content.
        if (before.status === "approved") {
          return { kind: "locked" as const };
        }

        const fields: string[] = [];
        const values: unknown[] = [];
        if (body.meeting_date !== undefined) {
          values.push(body.meeting_date);
          fields.push(`meeting_date = $${values.length}`);
        }
        if (body.meeting_type !== undefined) {
          values.push(body.meeting_type);
          fields.push(`meeting_type = $${values.length}`);
        }
        if (body.body !== undefined) {
          values.push(normalizeText(body.body));
          fields.push(`body = $${values.length}`);
        }
        if (body.status === "approved") {
          values.push(userId);
          fields.push(`approved_by = $${values.length}`);
          fields.push(`approved_at = now()`);
          fields.push(`status = 'approved'`);
        }

        if (fields.length === 0) {
          const tasks = await tasksForNote(tx, id);
          return { kind: "ok" as const, note: { ...before, tasks } };
        }

        values.push(id);
        const { rows: updatedRows } = await tx.query(
          `UPDATE meeting_notes SET ${fields.join(", ")} WHERE id = $${values.length} RETURNING *`,
          values
        );
        const updated = updatedRows[0];
        await recordAudit(tx, {
          userId,
          entityType: "meeting_note",
          entityId: id,
          action: "update",
          before,
          after: updated,
        });

        if (body.body !== undefined) {
          await syncTasksFromNote(tx, updated.client_id, updated, userId);
        }
        const tasks = await tasksForNote(tx, id);
        return { kind: "ok" as const, note: { ...updated, tasks } };
      });

      if (result.kind === "not_found") {
        reply.code(404).send({ error: "Meeting note not found" });
        return;
      }
      if (result.kind === "locked") {
        reply.code(400).send({ error: "Approved meeting notes can't be edited." });
        return;
      }
      return result.note;
    } catch (err) {
      const message = friendlyConstraintMessage(err);
      if (message) {
        reply.code(400).send({ error: message });
        return;
      }
      throw err;
    }
  });
};

export default meetingNotesRoutes;
