import type { FastifyPluginAsync } from "fastify";
import { pool, withTransaction } from "../db.js";
import { recordAudit } from "../audit.js";
import { friendlyConstraintMessage } from "../dbErrors.js";
import { normalizeText } from "../textNormalize.js";

const ITEM_COLUMNS = `
  id, client_id, type, description, owner_id, raised_at, status, created_at
`;

const createItemSchema = {
  body: {
    type: "object",
    required: ["type", "description", "owner_id"],
    properties: {
      type: { type: "string", enum: ["loa", "signature", "transfer"] },
      description: { type: "string", minLength: 1 },
      owner_id: { type: "integer" },
      raised_at: { type: "string", format: "date" },
    },
    additionalProperties: false,
  },
};

const patchItemSchema = {
  body: {
    type: "object",
    properties: {
      description: { type: "string", minLength: 1 },
      owner_id: { type: "integer" },
      status: { type: "string", enum: ["outstanding", "received", "cancelled"] },
    },
    additionalProperties: false,
  },
};

const chaseSchema = {
  body: {
    type: "object",
    properties: {
      chased_at: { type: "string", format: "date" },
    },
    additionalProperties: false,
  },
};

async function chasesForItem(itemId: number) {
  const { rows } = await pool.query(
    `SELECT c.id, c.outstanding_item_id, c.chased_at, c.chased_by, u.name AS chased_by_name, c.created_at
       FROM outstanding_item_chases c
       JOIN users u ON u.id = c.chased_by
      WHERE c.outstanding_item_id = $1
      ORDER BY c.chased_at DESC, c.created_at DESC`,
    [itemId]
  );
  return rows;
}

const outstandingItemsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/api/clients/:id/outstanding-items", { schema: createItemSchema }, async (request, reply) => {
    const clientId = Number((request.params as { id: string }).id);
    const body = request.body as {
      type: "loa" | "signature" | "transfer";
      description: string;
      owner_id: number;
      raised_at?: string;
    };
    const userId = request.user!.id;

    try {
      const created = await withTransaction(async (tx) => {
        const { rows } = await tx.query(
          `INSERT INTO outstanding_items (client_id, type, description, owner_id, raised_at)
           VALUES ($1, $2, $3, $4, COALESCE($5, CURRENT_DATE))
           RETURNING ${ITEM_COLUMNS}`,
          [clientId, body.type, normalizeText(body.description), body.owner_id, body.raised_at ?? null]
        );
        const row = rows[0];
        await recordAudit(tx, {
          userId,
          entityType: "outstanding_item",
          entityId: row.id,
          action: "create",
          before: null,
          after: row,
        });
        return row;
      });
      reply.code(201);
      return { ...created, chases: [] };
    } catch (err) {
      const message = friendlyConstraintMessage(err);
      if (message) {
        reply.code(400).send({ error: message });
        return;
      }
      throw err;
    }
  });

  fastify.patch("/api/outstanding-items/:id", { schema: patchItemSchema }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const body = request.body as { description?: string; owner_id?: number; status?: string };
    const userId = request.user!.id;

    try {
      const result = await withTransaction(async (tx) => {
        const { rows: beforeRows } = await tx.query(
          `SELECT * FROM outstanding_items WHERE id = $1 AND deleted_at IS NULL`,
          [id]
        );
        if (beforeRows.length === 0) return { kind: "not_found" as const };
        const before = beforeRows[0];

        const fields: string[] = [];
        const values: unknown[] = [];
        if (body.description !== undefined) {
          values.push(normalizeText(body.description));
          fields.push(`description = $${values.length}`);
        }
        if (body.owner_id !== undefined) {
          values.push(body.owner_id);
          fields.push(`owner_id = $${values.length}`);
        }
        if (body.status !== undefined) {
          values.push(body.status);
          fields.push(`status = $${values.length}`);
        }

        if (fields.length === 0) {
          return { kind: "ok" as const, item: before };
        }

        values.push(id);
        const { rows: updatedRows } = await tx.query(
          `UPDATE outstanding_items SET ${fields.join(", ")} WHERE id = $${values.length} RETURNING ${ITEM_COLUMNS}`,
          values
        );
        const updated = updatedRows[0];
        await recordAudit(tx, {
          userId,
          entityType: "outstanding_item",
          entityId: id,
          action: "update",
          before,
          after: updated,
        });
        return { kind: "ok" as const, item: updated };
      });

      if (result.kind === "not_found") {
        reply.code(404).send({ error: "Outstanding item not found" });
        return;
      }
      const chases = await chasesForItem(id);
      return { ...result.item, chases };
    } catch (err) {
      const message = friendlyConstraintMessage(err);
      if (message) {
        reply.code(400).send({ error: message });
        return;
      }
      throw err;
    }
  });

  fastify.delete("/api/outstanding-items/:id", async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const userId = request.user!.id;

    const result = await withTransaction(async (tx) => {
      const { rows: beforeRows } = await tx.query(
        `SELECT * FROM outstanding_items WHERE id = $1 AND deleted_at IS NULL`,
        [id]
      );
      if (beforeRows.length === 0) return null;
      const before = beforeRows[0];

      const { rows: afterRows } = await tx.query(
        `UPDATE outstanding_items SET deleted_at = now() WHERE id = $1 RETURNING *`,
        [id]
      );
      const after = afterRows[0];
      await recordAudit(tx, {
        userId,
        entityType: "outstanding_item",
        entityId: id,
        action: "delete",
        before,
        after,
      });
      return after;
    });

    if (!result) {
      reply.code(404).send({ error: "Outstanding item not found" });
      return;
    }
    reply.code(204);
  });

  fastify.post("/api/outstanding-items/:id/chases", { schema: chaseSchema }, async (request, reply) => {
    const itemId = Number((request.params as { id: string }).id);
    const body = request.body as { chased_at?: string };
    const userId = request.user!.id;

    try {
      const created = await withTransaction(async (tx) => {
        const { rows: itemRows } = await tx.query(
          `SELECT id FROM outstanding_items WHERE id = $1 AND deleted_at IS NULL`,
          [itemId]
        );
        if (itemRows.length === 0) return null;

        const { rows } = await tx.query(
          `INSERT INTO outstanding_item_chases (outstanding_item_id, chased_at, chased_by)
           VALUES ($1, COALESCE($2, CURRENT_DATE), $3)
           RETURNING id, outstanding_item_id, chased_at, chased_by, created_at`,
          [itemId, body.chased_at ?? null, userId]
        );
        const row = rows[0];
        await recordAudit(tx, {
          userId,
          entityType: "outstanding_item_chase",
          entityId: row.id,
          action: "create",
          before: null,
          after: row,
        });
        return row;
      });

      if (!created) {
        reply.code(404).send({ error: "Outstanding item not found" });
        return;
      }
      reply.code(201);
      const chases = await chasesForItem(itemId);
      return chases[0];
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

export default outstandingItemsRoutes;
