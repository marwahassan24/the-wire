import type { FastifyPluginAsync } from "fastify";
import { withTransaction } from "../db.js";
import { recordAudit } from "../audit.js";
import { friendlyConstraintMessage } from "../dbErrors.js";

const putPortfolioSchema = {
  body: {
    type: "object",
    required: ["summary"],
    properties: {
      summary: { type: "string" },
    },
    additionalProperties: false,
  },
};

const createPortfolioLogSchema = {
  body: {
    type: "object",
    required: ["text"],
    properties: {
      text: { type: "string", minLength: 1 },
      entry_date: { type: "string", format: "date" },
    },
    additionalProperties: false,
  },
};

const portfolioRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.put("/api/clients/:id/portfolio", { schema: putPortfolioSchema }, async (request, reply) => {
    const clientId = Number((request.params as { id: string }).id);
    const body = request.body as { summary: string };
    const userId = request.user!.id;

    try {
      const updated = await withTransaction(async (tx) => {
        const { rows: beforeRows } = await tx.query(
          `SELECT * FROM portfolio_summary WHERE client_id = $1`,
          [clientId]
        );
        const before = beforeRows[0] ?? null;

        const { rows } = await tx.query(
          `INSERT INTO portfolio_summary (client_id, summary, updated_by, updated_at)
           VALUES ($1, $2, $3, now())
           ON CONFLICT (client_id)
           DO UPDATE SET summary = EXCLUDED.summary, updated_by = EXCLUDED.updated_by, updated_at = now()
           RETURNING client_id, summary, updated_by, updated_at`,
          [clientId, body.summary, userId]
        );
        const after = rows[0];
        await recordAudit(tx, {
          userId,
          entityType: "portfolio_summary",
          entityId: clientId,
          action: before ? "update" : "create",
          before,
          after,
        });
        return after;
      });
      return updated;
    } catch (err) {
      const message = friendlyConstraintMessage(err);
      if (message) {
        reply.code(400).send({ error: message });
        return;
      }
      throw err;
    }
  });

  fastify.post(
    "/api/clients/:id/portfolio-log",
    { schema: createPortfolioLogSchema },
    async (request, reply) => {
      const clientId = Number((request.params as { id: string }).id);
      const body = request.body as { text: string; entry_date?: string };
      const userId = request.user!.id;

      try {
        const created = await withTransaction(async (tx) => {
          const { rows } = await tx.query(
            `INSERT INTO portfolio_log (client_id, entry_date, text, author_id)
             VALUES ($1, COALESCE($2, CURRENT_DATE), $3, $4)
             RETURNING id, client_id, entry_date, text, author_id, created_at`,
            [clientId, body.entry_date ?? null, body.text, userId]
          );
          const row = rows[0];
          await recordAudit(tx, {
            userId,
            entityType: "portfolio_log",
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
    }
  );
};

export default portfolioRoutes;
