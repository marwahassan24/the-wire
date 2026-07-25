import type { FastifyPluginAsync } from "fastify";
import { withTransaction } from "../db.js";
import { recordAudit } from "../audit.js";
import { friendlyConstraintMessage } from "../dbErrors.js";
import { normalizeText } from "../textNormalize.js";

const createSoftFactSchema = {
  body: {
    type: "object",
    required: ["text"],
    properties: {
      text: { type: "string", minLength: 1 },
      fact_date: { type: "string", format: "date" },
    },
    additionalProperties: false,
  },
};

const patchSoftFactSchema = {
  body: {
    type: "object",
    required: ["text"],
    properties: {
      text: { type: "string", minLength: 1 },
    },
    additionalProperties: false,
  },
};

const softFactsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/api/clients/:id/soft-facts", { schema: createSoftFactSchema }, async (request, reply) => {
    const clientId = Number((request.params as { id: string }).id);
    const body = request.body as { text: string; fact_date?: string };
    const userId = request.user!.id;

    try {
      const created = await withTransaction(async (tx) => {
        const { rows } = await tx.query(
          `INSERT INTO soft_facts (client_id, fact_date, text, author_id)
           VALUES ($1, COALESCE($2, CURRENT_DATE), $3, $4)
           RETURNING id, client_id, fact_date, text, author_id, created_at`,
          [clientId, body.fact_date ?? null, normalizeText(body.text), userId]
        );
        const row = rows[0];
        await recordAudit(tx, {
          userId,
          entityType: "soft_fact",
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

  fastify.patch("/api/soft-facts/:id", { schema: patchSoftFactSchema }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const body = request.body as { text: string };
    const userId = request.user!.id;

    try {
      const result = await withTransaction(async (tx) => {
        const { rows: beforeRows } = await tx.query(
          `SELECT * FROM soft_facts WHERE id = $1 AND deleted_at IS NULL`,
          [id]
        );
        if (beforeRows.length === 0) return null;
        const before = beforeRows[0];

        // fact_date is deliberately not editable here — it's the date the
        // thing happened, not the date it was written down.
        const { rows: afterRows } = await tx.query(
          `UPDATE soft_facts SET text = $1 WHERE id = $2 RETURNING *`,
          [normalizeText(body.text), id]
        );
        const after = afterRows[0];
        await recordAudit(tx, {
          userId,
          entityType: "soft_fact",
          entityId: id,
          action: "update",
          before,
          after,
        });
        return after;
      });

      if (!result) {
        reply.code(404).send({ error: "Soft fact not found" });
        return;
      }
      return result;
    } catch (err) {
      const message = friendlyConstraintMessage(err);
      if (message) {
        reply.code(400).send({ error: message });
        return;
      }
      throw err;
    }
  });

  fastify.delete("/api/soft-facts/:id", async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const userId = request.user!.id;

    const result = await withTransaction(async (tx) => {
      const { rows: beforeRows } = await tx.query(`SELECT * FROM soft_facts WHERE id = $1 AND deleted_at IS NULL`, [
        id,
      ]);
      if (beforeRows.length === 0) return null;
      const before = beforeRows[0];

      const { rows: afterRows } = await tx.query(
        `UPDATE soft_facts SET deleted_at = now() WHERE id = $1 RETURNING *`,
        [id]
      );
      const after = afterRows[0];
      await recordAudit(tx, {
        userId,
        entityType: "soft_fact",
        entityId: id,
        action: "delete",
        before,
        after,
      });
      return after;
    });

    if (!result) {
      reply.code(404).send({ error: "Soft fact not found" });
      return;
    }
    reply.code(204);
  });
};

export default softFactsRoutes;
