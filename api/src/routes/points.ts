import type { FastifyPluginAsync } from "fastify";
import { withTransaction } from "../db.js";
import { recordAudit } from "../audit.js";
import { friendlyConstraintMessage } from "../dbErrors.js";
import { normalizeText } from "../textNormalize.js";

const createPointSchema = {
  body: {
    type: "object",
    required: ["text"],
    properties: {
      text: { type: "string", minLength: 1 },
      raised_context: { type: "string" },
    },
    additionalProperties: false,
  },
};

const patchPointSchema = {
  body: {
    type: "object",
    properties: {
      text: { type: "string", minLength: 1 },
      status: { type: "string", enum: ["open", "carried", "resolved"] },
      resolution_note: { type: "string", minLength: 1 },
    },
    additionalProperties: false,
  },
};

const pointsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/api/clients/:id/points", { schema: createPointSchema }, async (request, reply) => {
    const clientId = Number((request.params as { id: string }).id);
    const body = request.body as { text: string; raised_context?: string };
    const userId = request.user!.id;

    try {
      const created = await withTransaction(async (tx) => {
        // Locks the client row for the duration of the transaction, so two
        // points raised on the same client at once still get distinct,
        // sequential numbers.
        const { rows: clientRows } = await tx.query(
          `UPDATE clients SET next_point_number = next_point_number + 1
            WHERE id = $1 AND deleted_at IS NULL
          RETURNING next_point_number`,
          [clientId]
        );
        if (clientRows.length === 0) {
          return null;
        }
        const assignedNumber = clientRows[0].next_point_number - 1;

        const { rows } = await tx.query(
          `INSERT INTO points (client_id, number, text, raised_context, status)
           VALUES ($1, $2, $3, $4, 'open')
           RETURNING id, client_id, number, text, status, resolution_note, raised_at,
                     raised_context, resolved_at, resolved_by, created_at`,
          [clientId, assignedNumber, normalizeText(body.text), body.raised_context ? normalizeText(body.raised_context) : null]
        );
        const row = rows[0];
        await recordAudit(tx, {
          userId,
          entityType: "point",
          entityId: row.id,
          action: "create",
          before: null,
          after: row,
        });
        return row;
      });

      if (!created) {
        reply.code(404).send({ error: "Client not found" });
        return;
      }
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

  fastify.patch("/api/points/:id", { schema: patchPointSchema }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const rawBody = request.body as { text?: string; status?: string; resolution_note?: string };
    const body = {
      ...rawBody,
      text: rawBody.text !== undefined ? normalizeText(rawBody.text) : undefined,
      resolution_note: rawBody.resolution_note !== undefined ? normalizeText(rawBody.resolution_note) : undefined,
    };
    const userId = request.user!.id;

    try {
      const result = await withTransaction(async (tx) => {
        const { rows: beforeRows } = await tx.query(`SELECT * FROM points WHERE id = $1 AND deleted_at IS NULL`, [
          id,
        ]);
        if (beforeRows.length === 0) return { kind: "not_found" as const };
        const before = beforeRows[0];

        const nextStatus = body.status ?? before.status;
        const nextResolutionNote = body.resolution_note ?? before.resolution_note;
        if (nextStatus !== "open" && !nextResolutionNote) {
          return { kind: "needs_resolution_note" as const };
        }

        const fields: string[] = [];
        const values: unknown[] = [];
        if (body.text !== undefined) {
          values.push(body.text);
          fields.push(`text = $${values.length}`);
        }
        if (body.resolution_note !== undefined) {
          values.push(body.resolution_note);
          fields.push(`resolution_note = $${values.length}`);
        }
        if (body.status !== undefined) {
          values.push(body.status);
          fields.push(`status = $${values.length}`);
          if (body.status === "resolved") {
            values.push(userId);
            fields.push(`resolved_by = $${values.length}`);
            fields.push(`resolved_at = now()`);
          }
        }

        if (fields.length === 0) {
          return { kind: "ok" as const, point: before };
        }

        values.push(id);
        const { rows: updatedRows } = await tx.query(
          `UPDATE points SET ${fields.join(", ")} WHERE id = $${values.length} RETURNING *`,
          values
        );
        const updated = updatedRows[0];
        await recordAudit(tx, {
          userId,
          entityType: "point",
          entityId: id,
          action: "update",
          before,
          after: updated,
        });
        return { kind: "ok" as const, point: updated };
      });

      if (result.kind === "not_found") {
        reply.code(404).send({ error: "Point not found" });
        return;
      }
      if (result.kind === "needs_resolution_note") {
        reply.code(400).send({ error: "resolution_note is required when a point leaves 'open'" });
        return;
      }
      return result.point;
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

export default pointsRoutes;
