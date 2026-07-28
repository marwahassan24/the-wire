import type { FastifyPluginAsync } from "fastify";
import { pool } from "../db.js";

// Same fixed order as the cases table's stage CHECK constraint.
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

// "Reviews due soon" = 6 weeks, and "stalled" = 14 days idle — both taken
// from the-wire.jsx's own OpsPage, not invented here, since this endpoint
// is the server-side version of exactly that screen.
const REVIEW_SOON_DAYS = 42;
const STALLED_DAYS = 14;

// "Going quiet" = no logged contact within this many days. Configurable
// per the brief; 90 is the default when the caller doesn't specify one.
const DEFAULT_QUIET_DAYS = 90;

const dashboardQuerySchema = {
  querystring: {
    type: "object",
    properties: {
      quiet_days: { type: "integer", minimum: 1 },
    },
    additionalProperties: false,
  },
};

interface CaseRow {
  id: number;
  client_id: number;
  title: string;
  stage: (typeof STAGES)[number];
  waiting_on: string | null;
  stage_updated_at: string;
  client_first_names: string;
  client_surname: string;
  idle_days: number;
}

const opsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/ops/dashboard", { schema: dashboardQuerySchema }, async (request) => {
    const { quiet_days } = request.query as { quiet_days?: number };
    const quietDays = quiet_days ?? DEFAULT_QUIET_DAYS;

    const [reviewsResult, noReviewDateResult, casesResult, workloadResult, goingQuietResult] = await Promise.all([
      pool.query(
        `SELECT c.id, c.first_names, c.surname, c.next_review_date, c.next_review_type,
                c.review_cycle, c.adviser_id, u.name AS adviser_name,
                (c.next_review_date - CURRENT_DATE) AS days_until
           FROM clients c
           JOIN users u ON u.id = c.adviser_id
          WHERE c.deleted_at IS NULL AND c.next_review_date IS NOT NULL
          ORDER BY c.next_review_date ASC`
      ),
      pool.query(
        `SELECT count(*)::int AS count FROM clients WHERE deleted_at IS NULL AND next_review_date IS NULL`
      ),
      pool.query<CaseRow>(
        `SELECT k.id, k.client_id, k.title, k.stage, k.waiting_on, k.stage_updated_at,
                c.first_names AS client_first_names, c.surname AS client_surname,
                (CURRENT_DATE - k.stage_updated_at::date) AS idle_days
           FROM cases k
           JOIN clients c ON c.id = k.client_id AND c.deleted_at IS NULL
          WHERE k.deleted_at IS NULL
          ORDER BY k.stage_updated_at ASC`
      ),
      // Every active staff member appears, even at zero load — an ops view
      // should show who has capacity, not just who's already carrying it.
      // The prototype only lists people who already own something; this is
      // a deliberate improvement, not an oversight.
      pool.query(
        `SELECT u.id, u.name,
                COUNT(DISTINCT t.id) FILTER (WHERE t.status != 'done')::int AS open_tasks,
                COUNT(DISTINCT t.id) FILTER (WHERE t.status != 'done' AND t.due_date < CURRENT_DATE)::int AS overdue_tasks,
                COUNT(DISTINCT k.id) FILTER (WHERE k.stage != 'Completed')::int AS open_cases
           FROM users u
           LEFT JOIN tasks t ON t.owner_id = u.id AND t.deleted_at IS NULL
             AND EXISTS (SELECT 1 FROM clients tc WHERE tc.id = t.client_id AND tc.deleted_at IS NULL)
           LEFT JOIN cases k ON k.owner_id = u.id AND k.deleted_at IS NULL
             AND EXISTS (SELECT 1 FROM clients kc WHERE kc.id = k.client_id AND kc.deleted_at IS NULL)
          WHERE u.active = true
          GROUP BY u.id, u.name
          ORDER BY u.name`
      ),
      // last_contact_date is NULL for a client with no contact_log rows at
      // all - those are the most silent of all, so NULLS FIRST puts them
      // ahead of merely-overdue clients in the "longest silent first" sort.
      pool.query(
        `SELECT c.id, c.first_names, c.surname, c.adviser_id, u.name AS adviser_name,
                MAX(cl.contact_date) AS last_contact_date,
                (CURRENT_DATE - MAX(cl.contact_date)) AS days_since_contact
           FROM clients c
           JOIN users u ON u.id = c.adviser_id
           LEFT JOIN contact_log cl ON cl.client_id = c.id AND cl.deleted_at IS NULL
          WHERE c.deleted_at IS NULL
          GROUP BY c.id, c.first_names, c.surname, c.adviser_id, u.name
         HAVING MAX(cl.contact_date) IS NULL OR MAX(cl.contact_date) <= CURRENT_DATE - $1::int
          ORDER BY MAX(cl.contact_date) ASC NULLS FIRST, c.surname, c.first_names`,
        [quietDays]
      ),
    ]);

    const reviewsDue = reviewsResult.rows;
    const cases = casesResult.rows;

    const reviewsOverdue = reviewsDue.filter((r) => r.days_until < 0).length;
    const reviewsDueSoon = reviewsDue.filter((r) => r.days_until >= 0 && r.days_until <= REVIEW_SOON_DAYS).length;
    const liveCases = cases.filter((k) => k.stage !== "Completed").length;
    const withProvider = cases.filter((k) => k.waiting_on === "provider" && k.stage !== "Completed").length;
    const withClient = cases.filter((k) => k.waiting_on === "client" && k.stage !== "Completed").length;
    const stalledCases = cases.filter((k) => k.stage !== "Completed" && k.idle_days > STALLED_DAYS).length;

    const pipeline = STAGES.map((stage) => ({
      stage,
      count: cases.filter((k) => k.stage === stage).length,
      cases: cases.filter((k) => k.stage === stage),
    }));

    return {
      stats: {
        reviewsOverdue,
        reviewsDueSoon,
        reviewsNoDateSet: noReviewDateResult.rows[0].count,
        liveCases,
        withProvider,
        withClient,
        stalledCases,
      },
      reviewsDue,
      pipeline,
      workload: workloadResult.rows,
      goingQuiet: goingQuietResult.rows,
      quietDays,
    };
  });
};

export default opsRoutes;
