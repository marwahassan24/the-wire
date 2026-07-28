import type { FastifyPluginAsync } from "fastify";
import { withTransaction } from "../db.js";
import { recordAudit } from "../audit.js";
import { friendlyConstraintMessage } from "../dbErrors.js";
import { normalizeText } from "../textNormalize.js";

const createContactLogSchema = {
  body: {
    type: "object",
    required: ["type", "staff_id", "note"],
    properties: {
      contact_date: { type: "string", format: "date" },
      type: { type: "string", enum: ["call", "email", "meeting", "other"] },
      staff_id: { type: "integer" },
      note: { type: "string", minLength: 1 },
    },
    additionalProperties: false,
  },
};

const contactLogRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/api/clients/:id/contact-log", { schema: createContactLogSchema }, async (request, reply) => {
    const clientId = Number((request.params as { id: string }).id);
    const body = request.body as { contact_date?: string; type: string; staff_id: number; note: string };
    const userId = request.user!.id;

    try {
      const created = await withTransaction(async (tx) => {
        const { rows } = await tx.query(
          `INSERT INTO contact_log (client_id, contact_date, type, staff_id, note)
           VALUES ($1, COALESCE($2, CURRENT_DATE), $3, $4, $5)
           RETURNING id, client_id, contact_date, type, staff_id, note, created_at`,
          [clientId, body.contact_date ?? null, body.type, body.staff_id, normalizeText(body.note)]
        );
        const row = rows[0];
        await recordAudit(tx, {
          userId,
          entityType: "contact_log",
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

  fastify.delete("/api/contact-log/:id", async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const userId = request.user!.id;

    const result = await withTransaction(async (tx) => {
      const { rows: beforeRows } = await tx.query(`SELECT * FROM contact_log WHERE id = $1 AND deleted_at IS NULL`, [
        id,
      ]);
      if (beforeRows.length === 0) return null;
      const before = beforeRows[0];

      const { rows: afterRows } = await tx.query(
        `UPDATE contact_log SET deleted_at = now() WHERE id = $1 RETURNING *`,
        [id]
      );
      const after = afterRows[0];
      await recordAudit(tx, {
        userId,
        entityType: "contact_log",
        entityId: id,
        action: "delete",
        before,
        after,
      });
      return after;
    });

    if (!result) {
      reply.code(404).send({ error: "Contact log entry not found" });
      return;
    }
    reply.code(204);
  });
};

export default contactLogRoutes;
