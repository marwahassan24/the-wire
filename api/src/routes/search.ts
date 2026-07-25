import type { FastifyPluginAsync } from "fastify";
import { pool } from "../db.js";

// ts_headline's default StartSel/StopSel are literal HTML tags. If a client
// ever rendered that via dangerouslySetInnerHTML, a stray '<' or '>' typed
// into a soft fact or meeting note would be interpreted as real markup —
// a narrow but real XSS path from internal, adviser-typed content. Using
// control characters as markers instead means the front end can split on
// them and render highlights as actual React elements, never raw HTML.
const HL_START = "\u0001";
const HL_STOP = "\u0002";
const HEADLINE_OPTIONS = `MaxWords=35, MinWords=15, StartSel=${HL_START}, StopSel=${HL_STOP}`;

const searchQuerySchema = {
  querystring: {
    type: "object",
    required: ["q"],
    properties: {
      q: { type: "string", minLength: 1 },
    },
    additionalProperties: false,
  },
};

const searchRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/search", { schema: searchQuerySchema }, async (request) => {
    const { q } = request.query as { q: string };

    const { rows } = await pool.query(
      `
      SELECT * FROM (
        SELECT
          'soft_fact' AS entity_type, sf.id AS entity_id, sf.client_id,
          c.first_names AS client_first_names, c.surname AS client_surname,
          ts_headline('english', sf.text, websearch_to_tsquery('english', $1), $2) AS excerpt,
          sf.fact_date AS entry_date,
          ts_rank(sf.search_vector, websearch_to_tsquery('english', $1)) AS rank
        FROM soft_facts sf
        JOIN clients c ON c.id = sf.client_id AND c.deleted_at IS NULL
        WHERE sf.deleted_at IS NULL AND sf.search_vector @@ websearch_to_tsquery('english', $1)

        UNION ALL

        SELECT
          'point', p.id, p.client_id,
          c.first_names, c.surname,
          ts_headline('english', p.text, websearch_to_tsquery('english', $1), $2),
          p.raised_at::date,
          ts_rank(p.search_vector, websearch_to_tsquery('english', $1))
        FROM points p
        JOIN clients c ON c.id = p.client_id AND c.deleted_at IS NULL
        WHERE p.deleted_at IS NULL AND p.search_vector @@ websearch_to_tsquery('english', $1)

        UNION ALL

        SELECT
          'meeting_note', mn.id, mn.client_id,
          c.first_names, c.surname,
          ts_headline('english', mn.body, websearch_to_tsquery('english', $1), $2),
          mn.meeting_date,
          ts_rank(mn.search_vector, websearch_to_tsquery('english', $1))
        FROM meeting_notes mn
        JOIN clients c ON c.id = mn.client_id AND c.deleted_at IS NULL
        WHERE mn.deleted_at IS NULL AND mn.search_vector @@ websearch_to_tsquery('english', $1)

        UNION ALL

        SELECT
          'portfolio_summary', ps.client_id, ps.client_id,
          c.first_names, c.surname,
          ts_headline('english', ps.summary, websearch_to_tsquery('english', $1), $2),
          ps.updated_at::date,
          ts_rank(ps.search_vector, websearch_to_tsquery('english', $1))
        FROM portfolio_summary ps
        JOIN clients c ON c.id = ps.client_id AND c.deleted_at IS NULL
        WHERE ps.search_vector @@ websearch_to_tsquery('english', $1)
      ) results
      ORDER BY rank DESC
      LIMIT 50
      `,
      [q, HEADLINE_OPTIONS]
    );

    return rows;
  });
};

export default searchRoutes;
