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

// "Reviews due soon" = 6 weeks - taken from the-wire.jsx's own OpsPage,
// not invented here, since this endpoint is the server-side version of
// exactly that screen.
const REVIEW_SOON_DAYS = 42;

// "Going quiet" = no logged contact within this many days. Configurable
// per the brief; 90 is the default when the caller doesn't specify one.
const DEFAULT_QUIET_DAYS = 90;

// SLA thresholds - "ageing work" and "cases at risk of delay". A case
// sitting at the same stage this many days is flagged stalled; this used
// to be a hardcoded 14 (from the-wire.jsx), now configurable the same way
// quiet_days is.
const DEFAULT_STALLED_DAYS = 14;

// Outstanding-item thresholds, one default per type rather than one
// number for all three - a 30-day-old LOA and a 30-day-old transfer don't
// mean the same thing:
//   - LOA: 21 days. Providers are usually quick to act on a Letter of
//     Authority once it lands; three weeks of silence is worth a chase.
//   - Signature: 14 days. Getting a client to sign something shouldn't
//     take more than two weeks without a nudge - the shortest of the three.
//   - Transfer: 45 days. ISA/pension transfers routinely take 4-8 weeks
//     through provider-side ceding processes with nobody at fault; a
//     shorter threshold here would just be constant false alarms.
const DEFAULT_THRESHOLD_DAYS: Record<"loa" | "signature" | "transfer", number> = {
  loa: 21,
  signature: 14,
  transfer: 45,
};

const dashboardQuerySchema = {
  querystring: {
    type: "object",
    properties: {
      quiet_days: { type: "integer", minimum: 1 },
      stalled_days: { type: "integer", minimum: 1 },
      loa_days: { type: "integer", minimum: 1 },
      signature_days: { type: "integer", minimum: 1 },
      transfer_days: { type: "integer", minimum: 1 },
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
    const { quiet_days, stalled_days, loa_days, signature_days, transfer_days } = request.query as {
      quiet_days?: number;
      stalled_days?: number;
      loa_days?: number;
      signature_days?: number;
      transfer_days?: number;
    };
    const quietDays = quiet_days ?? DEFAULT_QUIET_DAYS;
    const stalledDays = stalled_days ?? DEFAULT_STALLED_DAYS;
    const thresholds = {
      loa: loa_days ?? DEFAULT_THRESHOLD_DAYS.loa,
      signature: signature_days ?? DEFAULT_THRESHOLD_DAYS.signature,
      transfer: transfer_days ?? DEFAULT_THRESHOLD_DAYS.transfer,
    };

    const [
      reviewsResult,
      noReviewDateResult,
      casesResult,
      workloadResult,
      goingQuietResult,
      outstandingItemsResult,
    ] = await Promise.all([
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
      // Sorted oldest-raised-first regardless of type - the dashboard
      // groups by type client-side for the per-type counts/lists.
      pool.query(
        `SELECT oi.id, oi.client_id, c.first_names AS client_first_names, c.surname AS client_surname,
                oi.type, oi.description, oi.owner_id, u.name AS owner_name, oi.raised_at,
                (CURRENT_DATE - oi.raised_at) AS days_outstanding
           FROM outstanding_items oi
           JOIN clients c ON c.id = oi.client_id AND c.deleted_at IS NULL
           JOIN users u ON u.id = oi.owner_id
          WHERE oi.deleted_at IS NULL AND oi.status = 'outstanding'
          ORDER BY oi.raised_at ASC, oi.created_at ASC`
      ),
    ]);

    const reviewsDue = reviewsResult.rows;
    // stalled/flagged are computed once, server-side, and carried on the
    // row itself - the client reads them rather than re-deriving the same
    // threshold comparison independently (that duplication is exactly
    // what let the old hardcoded 14 drift out of sync with this endpoint).
    const cases = casesResult.rows.map((k) => ({
      ...k,
      stalled: k.stage !== "Completed" && k.idle_days > stalledDays,
    }));

    const reviewsOverdue = reviewsDue.filter((r) => r.days_until < 0).length;
    const reviewsDueSoon = reviewsDue.filter((r) => r.days_until >= 0 && r.days_until <= REVIEW_SOON_DAYS).length;
    const liveCases = cases.filter((k) => k.stage !== "Completed").length;
    const withProvider = cases.filter((k) => k.waiting_on === "provider" && k.stage !== "Completed").length;
    const withClient = cases.filter((k) => k.waiting_on === "client" && k.stage !== "Completed").length;
    const stalledCases = cases.filter((k) => k.stalled).length;

    const pipeline = STAGES.map((stage) => ({
      stage,
      count: cases.filter((k) => k.stage === stage).length,
      cases: cases.filter((k) => k.stage === stage),
    }));

    const outstandingItems = outstandingItemsResult.rows.map((item) => ({
      ...item,
      flagged: item.days_outstanding > thresholds[item.type as "loa" | "signature" | "transfer"],
    }));
    const outstandingByType = { loa: 0, signature: 0, transfer: 0 };
    for (const item of outstandingItems) {
      outstandingByType[item.type as "loa" | "signature" | "transfer"]++;
    }

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
      stalledDays,
      outstandingItems: {
        stats: outstandingByType,
        items: outstandingItems,
        thresholds,
      },
    };
  });
};

export default opsRoutes;
