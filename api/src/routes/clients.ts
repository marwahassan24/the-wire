import type { FastifyPluginAsync } from "fastify";
import { pool, withTransaction } from "../db.js";
import { recordAudit } from "../audit.js";
import { friendlyConstraintMessage } from "../dbErrors.js";

export const CLIENT_LIST_COLUMNS = `
  id, moneyinfo_client_id, first_names, surname, dob, dob_2, email, phone,
  status, adviser_id, cm_id, review_cycle, next_review_date, next_review_type,
  last_review_date, version, created_at, updated_at
`;

const CLIENT_EDITABLE_FIELDS = [
  "moneyinfo_client_id",
  "first_names",
  "surname",
  "dob",
  "dob_2",
  "email",
  "phone",
  "status",
  "adviser_id",
  "cm_id",
  "review_cycle",
  "next_review_date",
  "next_review_type",
  "last_review_date",
] as const;

const listQuerySchema = {
  querystring: {
    type: "object",
    properties: {
      q: { type: "string" },
      decade: { type: "integer" },
      status: { type: "string", enum: ["Working", "Retired"] },
      adviser: { type: "integer" },
      review_due: { type: "boolean" },
    },
    additionalProperties: false,
  },
};

const createClientSchema = {
  body: {
    type: "object",
    required: ["first_names", "surname", "status", "adviser_id", "cm_id", "review_cycle"],
    properties: {
      moneyinfo_client_id: { type: "string" },
      first_names: { type: "string", minLength: 1 },
      surname: { type: "string", minLength: 1 },
      dob: { type: "string", format: "date" },
      dob_2: { type: "string", format: "date" },
      email: { type: "string" },
      phone: { type: "string" },
      status: { type: "string", enum: ["Working", "Retired"] },
      adviser_id: { type: "integer" },
      cm_id: { type: "integer" },
      review_cycle: { type: "string", enum: ["Annual", "Interim", "Ad hoc"] },
      next_review_date: { type: "string", format: "date" },
      next_review_type: { type: "string", enum: ["Annual", "Interim", "Ad hoc"] },
      last_review_date: { type: "string", format: "date" },
    },
    additionalProperties: false,
  },
};

const patchClientSchema = {
  body: {
    type: "object",
    required: ["version"],
    properties: {
      version: { type: "integer" },
      moneyinfo_client_id: { type: "string" },
      first_names: { type: "string", minLength: 1 },
      surname: { type: "string", minLength: 1 },
      dob: { type: "string", format: "date" },
      dob_2: { type: "string", format: "date" },
      email: { type: "string" },
      phone: { type: "string" },
      status: { type: "string", enum: ["Working", "Retired"] },
      adviser_id: { type: "integer" },
      cm_id: { type: "integer" },
      review_cycle: { type: "string", enum: ["Annual", "Interim", "Ad hoc"] },
      next_review_date: { type: "string", format: "date" },
      next_review_type: { type: "string", enum: ["Annual", "Interim", "Ad hoc"] },
      last_review_date: { type: "string", format: "date" },
    },
    additionalProperties: false,
  },
};

const clientsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/clients", { schema: listQuerySchema }, async (request) => {
    const { q, decade, status, adviser, review_due } = request.query as {
      q?: string;
      decade?: number;
      status?: string;
      adviser?: number;
      review_due?: boolean;
    };

    const conditions: string[] = ["deleted_at IS NULL"];
    const params: unknown[] = [];

    if (q) {
      params.push(`%${q}%`);
      conditions.push(
        `(first_names ILIKE $${params.length} OR surname ILIKE $${params.length} OR email ILIKE $${params.length})`
      );
    }
    if (decade !== undefined) {
      params.push(decade);
      conditions.push(`FLOOR(DATE_PART('year', AGE(CURRENT_DATE, dob)) / 10) * 10 = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }
    if (adviser !== undefined) {
      params.push(adviser);
      conditions.push(`adviser_id = $${params.length}`);
    }
    if (review_due) {
      // "Due" = overdue or within the next 6 weeks — matches the ops
      // dashboard's "reviews due soon" window (see ops.ts), taken from
      // the-wire.jsx's own OpsPage rather than guessed independently.
      conditions.push(`next_review_date IS NOT NULL AND next_review_date <= CURRENT_DATE + INTERVAL '42 days'`);
    }

    const { rows } = await pool.query(
      `SELECT ${CLIENT_LIST_COLUMNS} FROM clients WHERE ${conditions.join(" AND ")} ORDER BY surname, first_names`,
      params
    );
    return rows;
  });

  fastify.post("/api/clients", { schema: createClientSchema }, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const userId = request.user!.id;

    try {
      const client = await withTransaction(async (tx) => {
        const { rows } = await tx.query(
          `INSERT INTO clients (
             moneyinfo_client_id, first_names, surname, dob, dob_2, email, phone,
             status, adviser_id, cm_id, review_cycle, next_review_date,
             next_review_type, last_review_date
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           RETURNING ${CLIENT_LIST_COLUMNS}`,
          [
            body.moneyinfo_client_id ?? null,
            body.first_names,
            body.surname,
            body.dob ?? null,
            body.dob_2 ?? null,
            body.email ?? null,
            body.phone ?? null,
            body.status,
            body.adviser_id,
            body.cm_id,
            body.review_cycle,
            body.next_review_date ?? null,
            body.next_review_type ?? null,
            body.last_review_date ?? null,
          ]
        );
        const created = rows[0];
        await recordAudit(tx, {
          userId,
          entityType: "client",
          entityId: created.id,
          action: "create",
          before: null,
          after: created,
        });
        return created;
      });
      reply.code(201);
      return client;
    } catch (err) {
      const message = friendlyConstraintMessage(err);
      if (message) {
        reply.code(400).send({ error: message });
        return;
      }
      throw err;
    }
  });

  fastify.get("/api/clients/:id", async (request, reply) => {
    const id = Number((request.params as { id: string }).id);

    const [clientResult, softFacts, points, meetingNotes, portfolioSummary, portfolioLog] = await Promise.all([
      pool.query(`SELECT ${CLIENT_LIST_COLUMNS} FROM clients WHERE id = $1 AND deleted_at IS NULL`, [id]),
      pool.query(
        `SELECT id, client_id, fact_date, text, author_id, created_at
           FROM soft_facts WHERE client_id = $1 AND deleted_at IS NULL
          ORDER BY fact_date DESC, created_at DESC`,
        [id]
      ),
      pool.query(
        `SELECT id, client_id, number, text, status, resolution_note, raised_at,
                raised_context, resolved_at, resolved_by, created_at
           FROM points WHERE client_id = $1 AND deleted_at IS NULL
          ORDER BY number ASC`,
        [id]
      ),
      pool.query(
        `SELECT id, client_id, meeting_date, meeting_type, body, author_id,
                status, approved_by, approved_at, created_at
           FROM meeting_notes WHERE client_id = $1 AND deleted_at IS NULL
          ORDER BY meeting_date DESC, created_at DESC`,
        [id]
      ),
      pool.query(`SELECT client_id, summary, updated_by, updated_at FROM portfolio_summary WHERE client_id = $1`, [
        id,
      ]),
      pool.query(
        `SELECT id, client_id, entry_date, text, author_id, created_at
           FROM portfolio_log WHERE client_id = $1 AND deleted_at IS NULL
          ORDER BY entry_date DESC, created_at DESC`,
        [id]
      ),
    ]);

    if (clientResult.rows.length === 0) {
      reply.code(404).send({ error: "Client not found" });
      return;
    }

    return {
      ...clientResult.rows[0],
      softFacts: softFacts.rows,
      points: points.rows,
      meetingNotes: meetingNotes.rows,
      portfolio: {
        summary: portfolioSummary.rows[0]?.summary ?? "",
        updated_by: portfolioSummary.rows[0]?.updated_by ?? null,
        updated_at: portfolioSummary.rows[0]?.updated_at ?? null,
        logs: portfolioLog.rows,
      },
    };
  });

  fastify.patch("/api/clients/:id", { schema: patchClientSchema }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const body = request.body as Record<string, unknown> & { version: number };
    const userId = request.user!.id;

    const fieldsToUpdate = CLIENT_EDITABLE_FIELDS.filter((f) => f in body);

    try {
      const result = await withTransaction(async (tx) => {
        const { rows: beforeRows } = await tx.query(
          `SELECT ${CLIENT_LIST_COLUMNS} FROM clients WHERE id = $1 AND deleted_at IS NULL`,
          [id]
        );
        if (beforeRows.length === 0) {
          return { kind: "not_found" as const };
        }
        const before = beforeRows[0];

        if (fieldsToUpdate.length === 0) {
          return { kind: "ok" as const, client: before };
        }

        const setClauses = fieldsToUpdate.map((f, i) => `${f} = $${i + 1}`);
        const values = fieldsToUpdate.map((f) => body[f]);
        values.push(id, body.version);

        const { rows: updatedRows } = await tx.query(
          `UPDATE clients
              SET ${setClauses.join(", ")}, version = version + 1, updated_at = now()
            WHERE id = $${values.length - 1} AND version = $${values.length}
          RETURNING ${CLIENT_LIST_COLUMNS}`,
          values
        );

        if (updatedRows.length === 0) {
          return { kind: "stale" as const, currentVersion: before.version };
        }

        const updated = updatedRows[0];
        await recordAudit(tx, {
          userId,
          entityType: "client",
          entityId: id,
          action: "update",
          before,
          after: updated,
        });
        return { kind: "ok" as const, client: updated };
      });

      if (result.kind === "not_found") {
        reply.code(404).send({ error: "Client not found" });
        return;
      }
      if (result.kind === "stale") {
        reply.code(409).send({
          error: "This client was changed by someone else since you loaded it. Reload and try again.",
          currentVersion: result.currentVersion,
        });
        return;
      }
      return result.client;
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

export default clientsRoutes;
