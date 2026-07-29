import type { FastifyPluginAsync } from "fastify";
import { pool } from "../db.js";

const logUsageSchema = {
  body: {
    type: "object",
    properties: {
      mode: { type: ["string", "null"] },
      model: { type: ["string", "null"] },
    },
    additionalProperties: false,
  },
};

// Usage telemetry for the AI reply tool (web/public/tools/ai-reply-tool.html)
// - a shared "This week / Total" count across the team, nothing else.
// Deliberately public/unauthenticated (registered outside the protected
// group in app.ts): the tool is an iframe served from the web app's own
// static origin, a different origin from this API, and its fetch calls
// use credentials: 'same-origin' - so the session cookie never reaches
// this API cross-origin regardless. No client message text is ever
// accepted here, only a mode/model label.
const aiAssistantUsageRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/api/ai-assistant/usage",
    {
      schema: logUsageSchema,
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const body = request.body as { mode?: string | null; model?: string | null } | undefined;
      await pool.query(`INSERT INTO ai_assistant_usage (mode, model, user_id) VALUES ($1, $2, $3)`, [
        body?.mode ?? null,
        body?.model ?? null,
        request.user?.id ?? null,
      ]);
      reply.code(204);
    }
  );

  fastify.get("/api/ai-assistant/usage/stats", async () => {
    const { rows } = await pool.query<{ week: string; total: string }>(
      `SELECT
         count(*) FILTER (WHERE created_at >= date_trunc('week', now())) AS week,
         count(*) AS total
       FROM ai_assistant_usage`
    );
    return { week: Number(rows[0].week), total: Number(rows[0].total) };
  });
};

export default aiAssistantUsageRoutes;
