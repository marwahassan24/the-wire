import type { FastifyPluginAsync } from "fastify";
import { pool, withTransaction } from "../db.js";
import { recordAudit } from "../audit.js";
import { friendlyConstraintMessage } from "../dbErrors.js";
import { normalizeText } from "../textNormalize.js";

const STAGES = [
  "Fact Find",
  "Research",
  "Recommendation",
  "Suitability Report",
  "Compliance Review",
  "Client Approval",
  "Submission",
  "Provider Processing",
  "Completed",
] as const;

const CASE_COLUMNS = `
  id, client_id, title, stage, waiting_on, owner_id,
  opened_at, stage_updated_at, closed_at, created_at
`;

const listQuerySchema = {
  querystring: {
    type: "object",
    properties: {
      stage: { type: "string", enum: STAGES as unknown as string[] },
      waiting_on: { type: "string", enum: ["us", "client", "provider", "third_party"] },
      owner: { type: "integer" },
    },
    additionalProperties: false,
  },
};

const createCaseSchema = {
  body: {
    type: "object",
    required: ["title"],
    properties: {
      title: { type: "string", minLength: 1 },
      stage: { type: "string", enum: STAGES as unknown as string[] },
      waiting_on: { type: "string", enum: ["us", "client", "provider", "third_party"] },
      owner_id: { type: "integer" },
    },
    additionalProperties: false,
  },
};

const patchCaseSchema = {
  body: {
    type: "object",
    properties: {
      title: { type: "string", minLength: 1 },
      stage: { type: "string", enum: STAGES as unknown as string[] },
      waiting_on: { type: "string", enum: ["us", "client", "provider", "third_party"] },
      owner_id: { type: "integer" },
      note: { type: "string" },
    },
    additionalProperties: false,
  },
};

const casesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/cases", { schema: listQuerySchema }, async (request) => {
    const { stage, waiting_on, owner } = request.query as {
      stage?: string;
      waiting_on?: string;
      owner?: number;
    };

    const conditions: string[] = ["k.deleted_at IS NULL"];
    const params: unknown[] = [];

    if (stage) {
      params.push(stage);
      conditions.push(`k.stage = $${params.length}`);
    }
    if (waiting_on) {
      params.push(waiting_on);
      conditions.push(`k.waiting_on = $${params.length}`);
    }
    if (owner !== undefined) {
      params.push(owner);
      conditions.push(`k.owner_id = $${params.length}`);
    }

    const { rows } = await pool.query(
      `SELECT k.id, k.client_id, k.title, k.stage, k.waiting_on, k.owner_id,
              k.opened_at, k.stage_updated_at, k.closed_at, k.created_at,
              c.first_names AS client_first_names, c.surname AS client_surname
         FROM cases k
         JOIN clients c ON c.id = k.client_id
        WHERE ${conditions.join(" AND ")}
        ORDER BY k.stage_updated_at DESC`,
      params
    );
    return rows;
  });

  fastify.post("/api/clients/:id/cases", { schema: createCaseSchema }, async (request, reply) => {
    const clientId = Number((request.params as { id: string }).id);
    const body = request.body as {
      title: string;
      stage?: (typeof STAGES)[number];
      waiting_on?: string;
      owner_id?: number;
    };
    const userId = request.user!.id;
    const stage = body.stage ?? "Fact Find";

    try {
      const created = await withTransaction(async (tx) => {
        const { rows } = await tx.query(
          `INSERT INTO cases (client_id, title, stage, waiting_on, owner_id)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING ${CASE_COLUMNS}`,
          [clientId, normalizeText(body.title), stage, body.waiting_on ?? null, body.owner_id ?? null]
        );
        const row = rows[0];

        await tx.query(
          `INSERT INTO case_events (case_id, from_stage, to_stage, user_id) VALUES ($1, NULL, $2, $3)`,
          [row.id, stage, userId]
        );

        await recordAudit(tx, {
          userId,
          entityType: "case",
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

  fastify.patch("/api/cases/:id", { schema: patchCaseSchema }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const body = request.body as {
      title?: string;
      stage?: (typeof STAGES)[number];
      waiting_on?: string;
      owner_id?: number;
      note?: string;
    };
    const userId = request.user!.id;

    try {
      const result = await withTransaction(async (tx) => {
        const { rows: beforeRows } = await tx.query(`SELECT * FROM cases WHERE id = $1 AND deleted_at IS NULL`, [
          id,
        ]);
        if (beforeRows.length === 0) return { kind: "not_found" as const };
        const before = beforeRows[0];

        const fields: string[] = [];
        const values: unknown[] = [];
        if (body.title !== undefined) {
          values.push(normalizeText(body.title));
          fields.push(`title = $${values.length}`);
        }
        if (body.waiting_on !== undefined) {
          values.push(body.waiting_on);
          fields.push(`waiting_on = $${values.length}`);
        }
        if (body.owner_id !== undefined) {
          values.push(body.owner_id);
          fields.push(`owner_id = $${values.length}`);
        }

        const stageChanging = body.stage !== undefined && body.stage !== before.stage;
        if (stageChanging) {
          values.push(body.stage);
          fields.push(`stage = $${values.length}`);
          fields.push(`stage_updated_at = now()`);
          fields.push(body.stage === "Completed" ? `closed_at = now()` : `closed_at = NULL`);
        }

        if (fields.length === 0) {
          return { kind: "ok" as const, case: before };
        }

        values.push(id);
        const { rows: updatedRows } = await tx.query(
          `UPDATE cases SET ${fields.join(", ")} WHERE id = $${values.length} RETURNING ${CASE_COLUMNS}`,
          values
        );
        const updated = updatedRows[0];

        if (stageChanging) {
          await tx.query(
            `INSERT INTO case_events (case_id, from_stage, to_stage, note, user_id) VALUES ($1, $2, $3, $4, $5)`,
            [id, before.stage, body.stage, body.note ? normalizeText(body.note) : null, userId]
          );
        }

        await recordAudit(tx, {
          userId,
          entityType: "case",
          entityId: id,
          action: "update",
          before,
          after: updated,
        });
        return { kind: "ok" as const, case: updated };
      });

      if (result.kind === "not_found") {
        reply.code(404).send({ error: "Case not found" });
        return;
      }
      return result.case;
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

export default casesRoutes;
