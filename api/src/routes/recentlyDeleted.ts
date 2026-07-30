import type { FastifyPluginAsync } from "fastify";
import { pool, withTransaction } from "../db.js";
import { recordAudit } from "../audit.js";

// Every soft-deletable table today has a NOT NULL client_id, so this map
// doubles as the allowlist for the restore route below - entityType comes
// straight from the URL, and interpolating it into SQL is only safe
// because it's checked against these exact keys first, never used raw.
const RESTORABLE_TABLES: Record<string, string> = {
  soft_fact: "soft_facts",
  contact_log: "contact_log",
  attachment: "attachments",
  outstanding_item: "outstanding_items",
};

// One row per soft-deleted record across every deletable table, each
// carrying a human summary of what it was and who deleted it (read off
// the audit trail's most recent 'delete' entry for that row, rather than
// a separate deleted_by column - the delete action is already logged
// there by every route below, so this is just reading it back).
function deletedItemsQuery(clientCondition: string): string {
  return `
    SELECT 'soft_fact' AS entity_type, sf.id AS entity_id, sf.client_id,
           'Soft facts' AS section, sf.text AS summary,
           to_char(sf.fact_date, 'DD Mon YYYY') AS meta,
           sf.deleted_at, au.user_id AS deleted_by_id, u.name AS deleted_by_name
      FROM soft_facts sf
      LEFT JOIN LATERAL (
        SELECT user_id FROM audit_log
         WHERE entity_type = 'soft_fact' AND entity_id = sf.id AND action = 'delete'
         ORDER BY created_at DESC LIMIT 1
      ) au ON true
      LEFT JOIN users u ON u.id = au.user_id
     WHERE sf.deleted_at IS NOT NULL AND sf.${clientCondition}

    UNION ALL

    SELECT 'contact_log', cl.id, cl.client_id,
           'Contact log', cl.note,
           initcap(cl.type) || ' - ' || to_char(cl.contact_date, 'DD Mon YYYY'),
           cl.deleted_at, au.user_id, u.name
      FROM contact_log cl
      LEFT JOIN LATERAL (
        SELECT user_id FROM audit_log
         WHERE entity_type = 'contact_log' AND entity_id = cl.id AND action = 'delete'
         ORDER BY created_at DESC LIMIT 1
      ) au ON true
      LEFT JOIN users u ON u.id = au.user_id
     WHERE cl.deleted_at IS NOT NULL AND cl.${clientCondition}

    UNION ALL

    SELECT 'attachment', a.id, a.client_id,
           'Documents', a.filename,
           a.content_type,
           a.deleted_at, au.user_id, u.name
      FROM attachments a
      LEFT JOIN LATERAL (
        SELECT user_id FROM audit_log
         WHERE entity_type = 'attachment' AND entity_id = a.id AND action = 'delete'
         ORDER BY created_at DESC LIMIT 1
      ) au ON true
      LEFT JOIN users u ON u.id = au.user_id
     WHERE a.deleted_at IS NOT NULL AND a.${clientCondition}

    UNION ALL

    SELECT 'outstanding_item', oi.id, oi.client_id,
           'Outstanding items', oi.description,
           initcap(oi.type),
           oi.deleted_at, au.user_id, u.name
      FROM outstanding_items oi
      LEFT JOIN LATERAL (
        SELECT user_id FROM audit_log
         WHERE entity_type = 'outstanding_item' AND entity_id = oi.id AND action = 'delete'
         ORDER BY created_at DESC LIMIT 1
      ) au ON true
      LEFT JOIN users u ON u.id = au.user_id
     WHERE oi.deleted_at IS NOT NULL AND oi.${clientCondition}

    ORDER BY deleted_at DESC
  `;
}

const recentlyDeletedRoutes: FastifyPluginAsync = async (fastify) => {
  // Per-client - what's been deleted from this one client's record.
  fastify.get("/api/clients/:id/recently-deleted", async (request) => {
    const clientId = Number((request.params as { id: string }).id);
    const { rows } = await pool.query(deletedItemsQuery("client_id = $1"), [clientId]);
    return rows;
  });

  // Firm-wide - anything deleted that isn't tied to a client at all. Every
  // deletable table today has a required client_id, so this is currently
  // always empty; it exists so the app doesn't need touching again the
  // day something client-less becomes deletable (a client record itself,
  // for instance).
  fastify.get("/api/recently-deleted", async () => {
    const { rows } = await pool.query(deletedItemsQuery("client_id IS NULL"));
    return rows;
  });

  fastify.post("/api/recently-deleted/:entityType/:id/restore", async (request, reply) => {
    const { entityType } = request.params as { entityType: string; id: string };
    const id = Number((request.params as { id: string }).id);
    const table = RESTORABLE_TABLES[entityType];
    const userId = request.user!.id;

    if (!table) {
      reply.code(400).send({ error: "Unknown entity type" });
      return;
    }

    const result = await withTransaction(async (tx) => {
      const { rows: beforeRows } = await tx.query(`SELECT * FROM ${table} WHERE id = $1 AND deleted_at IS NOT NULL`, [
        id,
      ]);
      if (beforeRows.length === 0) return null;
      const before = beforeRows[0];

      const { rows: afterRows } = await tx.query(
        `UPDATE ${table} SET deleted_at = NULL WHERE id = $1 RETURNING *`,
        [id]
      );
      const after = afterRows[0];

      await recordAudit(tx, {
        userId,
        entityType,
        entityId: id,
        action: "restore",
        before,
        after,
      });
      return after;
    });

    if (!result) {
      reply.code(404).send({ error: "Deleted item not found" });
      return;
    }
    return result;
  });
};

export default recentlyDeletedRoutes;
