import type { FastifyPluginAsync } from "fastify";
import { pool } from "../db.js";
import { diagnoseAlert } from "../daysAlive/diagnose.js";
import { previewUpcoming } from "../daysAlive/preview.js";
import { runDailyCheck } from "../daysAlive/runDailyCheck.js";
import { loadSettings } from "../daysAlive/settings.js";

const settingsSchema = {
  body: {
    type: "object",
    properties: {
      enabled: { type: "boolean" },
      warning_days_before: { type: "integer", minimum: 1 },
      card_lead_days: { type: "integer", minimum: 0 },
      recipient_email: { type: ["string", "null"], format: "email" },
    },
    additionalProperties: false,
  },
};

const addMilestoneSchema = {
  body: {
    type: "object",
    required: ["days"],
    properties: { days: { type: "integer", minimum: 1 } },
    additionalProperties: false,
  },
};

const patchMilestoneSchema = {
  body: {
    type: "object",
    required: ["enabled"],
    properties: { enabled: { type: "boolean" } },
    additionalProperties: false,
  },
};

const listAlertsSchema = {
  querystring: {
    type: "object",
    properties: {
      client_id: { type: "integer" },
      status: { type: "string", enum: ["pending", "sent", "failed", "skipped"] },
      milestone_days: { type: "integer" },
      from: { type: "string", format: "date" },
      to: { type: "string", format: "date" },
    },
    additionalProperties: false,
  },
};

const runSchema = {
  body: {
    type: "object",
    properties: { date: { type: "string", format: "date" } },
    additionalProperties: false,
  },
};

const previewSchema = {
  querystring: {
    type: "object",
    properties: { days: { type: "integer", enum: [30, 60, 90] } },
    additionalProperties: false,
  },
};

const diagnoseSchema = {
  querystring: {
    type: "object",
    required: ["client_id", "milestone_days"],
    properties: {
      client_id: { type: "integer" },
      milestone_days: { type: "integer" },
      milestone_date: { type: "string", format: "date" },
      evaluation_date: { type: "string", format: "date" },
    },
    additionalProperties: false,
  },
};

const daysAliveRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/days-alive/settings", { preHandler: fastify.requireAdmin }, async () => {
    return loadSettings();
  });

  fastify.patch(
    "/api/days-alive/settings",
    { schema: settingsSchema, preHandler: fastify.requireAdmin },
    async (request) => {
      const body = request.body as {
        enabled?: boolean;
        warning_days_before?: number;
        card_lead_days?: number;
        recipient_email?: string | null;
      };
      const current = await loadSettings();

      const fields: string[] = [];
      const values: unknown[] = [];
      if (body.enabled !== undefined) {
        values.push(body.enabled);
        fields.push(`enabled = $${values.length}`);
      }
      if (body.warning_days_before !== undefined) {
        values.push(body.warning_days_before);
        fields.push(`warning_days_before = $${values.length}`);
      }
      if (body.card_lead_days !== undefined) {
        values.push(body.card_lead_days);
        fields.push(`card_lead_days = $${values.length}`);
      }
      if (body.recipient_email !== undefined) {
        values.push(body.recipient_email);
        fields.push(`recipient_email = $${values.length}`);
      }
      if (fields.length === 0) return current;

      fields.push(`updated_at = now()`);
      values.push(current.id);
      const { rows } = await pool.query(
        `UPDATE days_alive_settings SET ${fields.join(", ")} WHERE id = $${values.length}
         RETURNING id, enabled, warning_days_before, card_lead_days, recipient_email`,
        values
      );
      const row = rows[0];
      return {
        id: row.id,
        enabled: row.enabled,
        warningDaysBefore: row.warning_days_before,
        cardLeadDays: row.card_lead_days,
        recipientEmail: row.recipient_email,
      };
    }
  );

  fastify.get("/api/days-alive/milestones", { preHandler: fastify.requireAdmin }, async () => {
    const { rows } = await pool.query(
      `SELECT id, days, enabled, created_at FROM days_alive_milestones ORDER BY days`
    );
    return rows;
  });

  fastify.post(
    "/api/days-alive/milestones",
    { schema: addMilestoneSchema, preHandler: fastify.requireAdmin },
    async (request, reply) => {
      const body = request.body as { days: number };
      try {
        const { rows } = await pool.query(
          `INSERT INTO days_alive_milestones (days) VALUES ($1) RETURNING id, days, enabled, created_at`,
          [body.days]
        );
        reply.code(201);
        return rows[0];
      } catch (err) {
        if (err instanceof Error && "code" in err && (err as { code: string }).code === "23505") {
          reply.code(400).send({ error: `Milestone ${body.days} already exists` });
          return;
        }
        throw err;
      }
    }
  );

  fastify.patch(
    "/api/days-alive/milestones/:id",
    { schema: patchMilestoneSchema, preHandler: fastify.requireAdmin },
    async (request, reply) => {
      const id = Number((request.params as { id: string }).id);
      const body = request.body as { enabled: boolean };
      const { rows } = await pool.query(
        `UPDATE days_alive_milestones SET enabled = $1 WHERE id = $2 RETURNING id, days, enabled, created_at`,
        [body.enabled, id]
      );
      if (rows.length === 0) {
        reply.code(404).send({ error: "Milestone not found" });
        return;
      }
      return rows[0];
    }
  );

  fastify.delete("/api/days-alive/milestones/:id", { preHandler: fastify.requireAdmin }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const { rowCount } = await pool.query(`DELETE FROM days_alive_milestones WHERE id = $1`, [id]);
    if (rowCount === 0) {
      reply.code(404).send({ error: "Milestone not found" });
      return;
    }
    reply.code(204);
  });

  fastify.get(
    "/api/days-alive/alerts",
    { schema: listAlertsSchema, preHandler: fastify.requireAdmin },
    async (request) => {
      const query = request.query as {
        client_id?: number;
        status?: string;
        milestone_days?: number;
        from?: string;
        to?: string;
      };
      const conditions: string[] = [];
      const values: unknown[] = [];
      if (query.client_id !== undefined) {
        values.push(query.client_id);
        conditions.push(`a.client_id = $${values.length}`);
      }
      if (query.status !== undefined) {
        values.push(query.status);
        conditions.push(`a.status = $${values.length}`);
      }
      if (query.milestone_days !== undefined) {
        values.push(query.milestone_days);
        conditions.push(`a.milestone_days = $${values.length}`);
      }
      if (query.from !== undefined) {
        values.push(query.from);
        conditions.push(`a.alert_date >= $${values.length}`);
      }
      if (query.to !== undefined) {
        values.push(query.to);
        conditions.push(`a.alert_date <= $${values.length}`);
      }
      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const { rows } = await pool.query(
        `SELECT a.id, a.client_id, c.first_names AS client_first_names, c.surname AS client_surname,
                a.milestone_days, a.milestone_date, a.alert_date, a.alert_days_before,
                a.age_years_on_milestone, a.status, a.recipient, a.email_subject,
                a.error_message, a.created_at, a.sent_at, a.job_run_id
           FROM days_alive_alerts a
           JOIN clients c ON c.id = a.client_id
           ${where}
          ORDER BY a.alert_date DESC, a.id DESC
          LIMIT 500`,
        values
      );
      return rows;
    }
  );

  fastify.get("/api/days-alive/job-runs", { preHandler: fastify.requireAdmin }, async () => {
    const { rows } = await pool.query(
      `SELECT id, run_date, started_at, finished_at, clients_checked, alerts_sent, alerts_skipped, alerts_failed
         FROM days_alive_job_runs
        ORDER BY run_date DESC, id DESC
        LIMIT 90`
    );
    return rows;
  });

  // Manual rerun for a given date (defaults to today) - the real thing,
  // same idempotency guard as the scheduled job, so rerunning a date
  // that's already been processed just reports skips, not duplicates.
  fastify.post("/api/days-alive/run", { schema: runSchema, preHandler: fastify.requireAdmin }, async (request) => {
    const body = request.body as { date?: string };
    return runDailyCheck({ asOfDate: body.date });
  });

  // Preview - dry run, nothing written, nothing sent.
  fastify.get(
    "/api/days-alive/preview",
    { schema: previewSchema, preHandler: fastify.requireAdmin },
    async (request) => {
      const query = request.query as { days?: number };
      return previewUpcoming(query.days ?? 30);
    }
  );

  fastify.get(
    "/api/days-alive/diagnose",
    { schema: diagnoseSchema, preHandler: fastify.requireAdmin },
    async (request) => {
      const query = request.query as {
        client_id: number;
        milestone_days: number;
        milestone_date?: string;
        evaluation_date?: string;
      };
      return diagnoseAlert({
        clientId: query.client_id,
        milestoneDays: query.milestone_days,
        milestoneDate: query.milestone_date,
        evaluationDate: query.evaluation_date,
      });
    }
  );
};

export default daysAliveRoutes;
