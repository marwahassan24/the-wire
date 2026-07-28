import type { FastifyPluginAsync } from "fastify";
import { pool } from "../db.js";
import { CLIENT_LIST_COLUMNS } from "./clients.js";

// "Recent" isn't quantified in the brief for soft facts or the portfolio
// log. 5 is a judgment call — enough to remind an adviser what's been
// going on without turning prep into the full spine.
const RECENT_LIMIT = 5;

const prepRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/clients/:id/prep", async (request, reply) => {
    const id = Number((request.params as { id: string }).id);

    const [
      clientResult,
      points,
      recentSoftFacts,
      portfolioSummary,
      recentPortfolioLog,
      outstandingTasks,
      lastMeetingNote,
      recentContactLog,
    ] = await Promise.all([
        pool.query(`SELECT ${CLIENT_LIST_COLUMNS} FROM clients WHERE id = $1 AND deleted_at IS NULL`, [id]),

        // Open and carried points, with their full history (resolution_note,
        // raised_context, etc.) — this is the load-bearing part: a point
        // raised in one meeting has to reliably surface in the next prep.
        pool.query(
          `SELECT id, client_id, number, text, status, resolution_note, raised_at,
                  raised_context, resolved_at, resolved_by, created_at
             FROM points
            WHERE client_id = $1 AND deleted_at IS NULL AND status IN ('open', 'carried')
            ORDER BY number ASC`,
          [id]
        ),

        pool.query(
          `SELECT id, client_id, fact_date, text, author_id, created_at
             FROM soft_facts
            WHERE client_id = $1 AND deleted_at IS NULL
            ORDER BY fact_date DESC, created_at DESC
            LIMIT ${RECENT_LIMIT}`,
          [id]
        ),

        pool.query(`SELECT client_id, summary, updated_by, updated_at FROM portfolio_summary WHERE client_id = $1`, [
          id,
        ]),

        pool.query(
          `SELECT id, client_id, entry_date, text, author_id, created_at
             FROM portfolio_log
            WHERE client_id = $1 AND deleted_at IS NULL
            ORDER BY entry_date DESC, created_at DESC
            LIMIT ${RECENT_LIMIT}`,
          [id]
        ),

        // Outstanding = not yet done, whether or not it's cleared the
        // sense-check gate — both still count as work not yet finished.
        pool.query(
          `SELECT t.id, t.client_id, t.text, t.owner_id, t.due_date, t.status, t.source,
                  t.confirmed_by, t.confirmed_at, t.created_at,
                  u.name AS owner_name
             FROM tasks t
             JOIN users u ON u.id = t.owner_id
            WHERE t.client_id = $1 AND t.deleted_at IS NULL AND t.status != 'done'
            ORDER BY t.due_date NULLS LAST, t.created_at`,
          [id]
        ),

        // "The last Meeting Note" — singular, most recent, regardless of
        // draft/approved: prep is an internal view, not the client-visible
        // one, so an adviser needs to see it even before it's approved.
        pool.query(
          `SELECT id, client_id, meeting_date, meeting_type, body, author_id,
                  status, approved_by, approved_at, created_at
             FROM meeting_notes
            WHERE client_id = $1 AND deleted_at IS NULL
            ORDER BY meeting_date DESC, created_at DESC
            LIMIT 1`,
          [id]
        ),

        pool.query(
          `SELECT cl.id, cl.client_id, cl.contact_date, cl.type, cl.staff_id, u.name AS staff_name,
                  cl.note, cl.created_at
             FROM contact_log cl
             JOIN users u ON u.id = cl.staff_id
            WHERE cl.client_id = $1 AND cl.deleted_at IS NULL
            ORDER BY cl.contact_date DESC, cl.created_at DESC
            LIMIT ${RECENT_LIMIT}`,
          [id]
        ),
      ]);

    if (clientResult.rows.length === 0) {
      reply.code(404).send({ error: "Client not found" });
      return;
    }

    return {
      ...clientResult.rows[0],
      points: points.rows,
      recentSoftFacts: recentSoftFacts.rows,
      portfolio: {
        summary: portfolioSummary.rows[0]?.summary ?? "",
        updated_by: portfolioSummary.rows[0]?.updated_by ?? null,
        updated_at: portfolioSummary.rows[0]?.updated_at ?? null,
        recentLogs: recentPortfolioLog.rows,
      },
      outstandingTasks: outstandingTasks.rows,
      lastMeetingNote: lastMeetingNote.rows[0] ?? null,
      recentContactLog: recentContactLog.rows,
      lastContactDate: recentContactLog.rows[0]?.contact_date ?? null,
    };
  });
};

export default prepRoutes;
