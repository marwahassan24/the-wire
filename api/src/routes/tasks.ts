import type { FastifyPluginAsync } from "fastify";
import { pool, withTransaction } from "../db.js";
import { recordAudit } from "../audit.js";
import { friendlyConstraintMessage } from "../dbErrors.js";

const TASK_COLUMNS = `
  id, client_id, text, owner_id, due_date, status, source,
  confirmed_by, confirmed_at, created_at
`;

const listQuerySchema = {
  querystring: {
    type: "object",
    properties: {
      owner: { type: "integer" },
      status: { type: "string", enum: ["awaiting_sense_check", "confirmed", "done"] },
      due: { type: "string", enum: ["today", "overdue"] },
    },
    additionalProperties: false,
  },
};

const createTaskSchema = {
  body: {
    type: "object",
    required: ["text", "owner_id"],
    properties: {
      text: { type: "string", minLength: 1 },
      owner_id: { type: "integer" },
      due_date: { type: "string", format: "date" },
      // Not settable by today's UI — reserved for the automated producers
      // (meeting-note extraction, moneyinfo sync) that don't exist yet.
      // Defaults to 'manual', which is the only source a live human caller
      // can legitimately claim right now.
      source: { type: "string", enum: ["manual", "meeting_note", "sync"] },
    },
    additionalProperties: false,
  },
};

const patchTaskSchema = {
  body: {
    type: "object",
    properties: {
      text: { type: "string", minLength: 1 },
      owner_id: { type: "integer" },
      due_date: { type: "string", format: "date" },
      status: { type: "string", enum: ["confirmed", "done"] },
    },
    additionalProperties: false,
  },
};

const tasksRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/tasks", { schema: listQuerySchema }, async (request) => {
    const { owner, status, due } = request.query as { owner?: number; status?: string; due?: string };

    const conditions: string[] = ["t.deleted_at IS NULL"];
    const params: unknown[] = [];

    if (owner !== undefined) {
      params.push(owner);
      conditions.push(`t.owner_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`t.status = $${params.length}`);
    }
    if (due === "today") {
      conditions.push(`t.due_date = CURRENT_DATE`);
    } else if (due === "overdue") {
      conditions.push(`t.due_date < CURRENT_DATE AND t.status != 'done'`);
    }

    const { rows } = await pool.query(
      `SELECT t.id, t.client_id, t.text, t.owner_id, t.due_date, t.status, t.source,
              t.confirmed_by, t.confirmed_at, t.created_at,
              c.first_names AS client_first_names, c.surname AS client_surname,
              u.name AS owner_name
         FROM tasks t
         JOIN clients c ON c.id = t.client_id
         JOIN users u ON u.id = t.owner_id
        WHERE ${conditions.join(" AND ")}
        ORDER BY t.due_date NULLS LAST, t.created_at`,
      params
    );
    return rows;
  });

  fastify.post("/api/clients/:id/tasks", { schema: createTaskSchema }, async (request, reply) => {
    const clientId = Number((request.params as { id: string }).id);
    const body = request.body as {
      text: string;
      owner_id: number;
      due_date?: string;
      source?: "manual" | "meeting_note" | "sync";
    };
    const userId = request.user!.id;
    const source = body.source ?? "manual";

    // The sense-check gate: only a task a human is creating themselves,
    // right now, through this endpoint, can start out already confirmed.
    // Anything declaring an automated source starts awaiting_sense_check —
    // the system never self-confirms its own or anyone else's output.
    const startsConfirmed = source === "manual";

    try {
      const created = await withTransaction(async (tx) => {
        const { rows } = await tx.query(
          `INSERT INTO tasks (client_id, text, owner_id, due_date, source, status, confirmed_by, confirmed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING ${TASK_COLUMNS}`,
          [
            clientId,
            body.text,
            body.owner_id,
            body.due_date ?? null,
            source,
            startsConfirmed ? "confirmed" : "awaiting_sense_check",
            startsConfirmed ? userId : null,
            startsConfirmed ? new Date() : null,
          ]
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

  fastify.patch("/api/tasks/:id", { schema: patchTaskSchema }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const body = request.body as {
      text?: string;
      owner_id?: number;
      due_date?: string;
      status?: "confirmed" | "done";
    };
    const userId = request.user!.id;

    try {
      const result = await withTransaction(async (tx) => {
        const { rows: beforeRows } = await tx.query(`SELECT * FROM tasks WHERE id = $1 AND deleted_at IS NULL`, [
          id,
        ]);
        if (beforeRows.length === 0) return { kind: "not_found" as const };
        const before = beforeRows[0];

        if (body.status && body.status !== before.status) {
          if (body.status === "done" && before.status === "awaiting_sense_check") {
            return { kind: "needs_confirmation" as const };
          }
          if (body.status === "confirmed" && before.status === "done") {
            return { kind: "invalid_transition" as const, message: "Can't move a completed task back to confirmed." };
          }
        }

        const fields: string[] = [];
        const values: unknown[] = [];
        if (body.text !== undefined) {
          values.push(body.text);
          fields.push(`text = $${values.length}`);
        }
        if (body.owner_id !== undefined) {
          values.push(body.owner_id);
          fields.push(`owner_id = $${values.length}`);
        }
        if (body.due_date !== undefined) {
          values.push(body.due_date);
          fields.push(`due_date = $${values.length}`);
        }
        if (body.status && body.status !== before.status) {
          values.push(body.status);
          fields.push(`status = $${values.length}`);
          if (body.status === "confirmed") {
            values.push(userId);
            fields.push(`confirmed_by = $${values.length}`);
            fields.push(`confirmed_at = now()`);
          }
        }

        if (fields.length === 0) {
          return { kind: "ok" as const, task: before };
        }

        values.push(id);
        const { rows: updatedRows } = await tx.query(
          `UPDATE tasks SET ${fields.join(", ")} WHERE id = $${values.length} RETURNING ${TASK_COLUMNS}`,
          values
        );
        const updated = updatedRows[0];
        await recordAudit(tx, {
          userId,
          entityType: "task",
          entityId: id,
          action: "update",
          before,
          after: updated,
        });
        return { kind: "ok" as const, task: updated };
      });

      if (result.kind === "not_found") {
        reply.code(404).send({ error: "Task not found" });
        return;
      }
      if (result.kind === "needs_confirmation") {
        reply.code(400).send({ error: "Confirm this task before marking it done." });
        return;
      }
      if (result.kind === "invalid_transition") {
        reply.code(400).send({ error: result.message });
        return;
      }
      return result.task;
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

export default tasksRoutes;
