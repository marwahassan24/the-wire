import type { PoolClient } from "pg";

export type AuditAction = "create" | "update" | "delete" | "restore";

export interface AuditParams {
  // Null marks a machine-authored write (e.g. the moneyinfo sync job) -
  // audit_log.user_id is nullable in the schema for exactly this reason.
  userId: number | null;
  entityType: string;
  entityId: number;
  action: AuditAction;
  before: unknown;
  after: unknown;
}

// Written inside the same transaction as the change it describes, so a
// write and its audit entry always succeed or fail together.
export async function recordAudit(client: PoolClient, params: AuditParams): Promise<void> {
  await client.query(
    `INSERT INTO audit_log (user_id, entity_type, entity_id, action, before, after)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      params.userId,
      params.entityType,
      params.entityId,
      params.action,
      params.before === undefined ? null : JSON.stringify(params.before),
      params.after === undefined ? null : JSON.stringify(params.after),
    ]
  );
}
