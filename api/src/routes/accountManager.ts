import type { FastifyPluginAsync } from "fastify";
import { pool, withTransaction } from "../db.js";
import { hashPassword } from "../auth/password.js";
import { recordAudit } from "../audit.js";
import { friendlyConstraintMessage } from "../dbErrors.js";

const ROLES = ["adviser", "client_manager", "admin"] as const;

// Never includes password_hash - nothing that touches this constant should
// ever be able to leak a hash into an API response or an audit_log row.
const USER_COLUMNS = "id, email, name, role, active, created_at, last_login_at";

const createUserSchema = {
  body: {
    type: "object",
    required: ["email", "name", "role", "password"],
    properties: {
      email: { type: "string", format: "email" },
      name: { type: "string", minLength: 1 },
      role: { type: "string", enum: ROLES },
      password: { type: "string", minLength: 8 },
    },
    additionalProperties: false,
  },
};

const updateUserSchema = {
  body: {
    type: "object",
    properties: {
      email: { type: "string", format: "email" },
      name: { type: "string", minLength: 1 },
      role: { type: "string", enum: ROLES },
      active: { type: "boolean" },
    },
    additionalProperties: false,
  },
};

const resetPasswordSchema = {
  body: {
    type: "object",
    required: ["password"],
    properties: { password: { type: "string", minLength: 8 } },
    additionalProperties: false,
  },
};

const accountManagerRoutes: FastifyPluginAsync = async (fastify) => {
  // Everyone (inactive included, unlike the plain /api/users picker list) -
  // an admin needs to see who's deactivated in order to reactivate them.
  fastify.get("/api/admin/users", { preHandler: fastify.requireAdmin }, async () => {
    const { rows } = await pool.query(`SELECT ${USER_COLUMNS} FROM users ORDER BY active DESC, name`);
    return rows;
  });

  fastify.post(
    "/api/admin/users",
    { schema: createUserSchema, preHandler: fastify.requireAdmin },
    async (request, reply) => {
      const body = request.body as { email: string; name: string; role: string; password: string };
      const actorId = request.user!.id;

      try {
        const created = await withTransaction(async (tx) => {
          const passwordHash = await hashPassword(body.password);
          const { rows } = await tx.query(
            `INSERT INTO users (email, password_hash, name, role)
             VALUES ($1, $2, $3, $4)
             RETURNING ${USER_COLUMNS}`,
            [body.email.trim().toLowerCase(), passwordHash, body.name.trim(), body.role]
          );
          const row = rows[0];
          await recordAudit(tx, {
            userId: actorId,
            entityType: "user",
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
    }
  );

  fastify.patch(
    "/api/admin/users/:id",
    { schema: updateUserSchema, preHandler: fastify.requireAdmin },
    async (request, reply) => {
      const id = Number((request.params as { id: string }).id);
      const body = request.body as { email?: string; name?: string; role?: string; active?: boolean };
      const actorId = request.user!.id;

      if (Object.keys(body).length === 0) {
        reply.code(400).send({ error: "Nothing to update." });
        return;
      }
      // An admin locking themselves out (deactivating their own account, or
      // demoting themselves away from admin) has no way back short of
      // someone editing the database directly - refuse it here rather than
      // let it happen by accident. Another admin can still do either to
      // this account; only self-service is blocked.
      if (id === actorId && (body.active === false || (body.role !== undefined && body.role !== "admin"))) {
        reply.code(400).send({ error: "You can't remove your own admin access - ask another admin to do it." });
        return;
      }

      try {
        const result = await withTransaction(async (tx) => {
          const { rows: beforeRows } = await tx.query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
          if (beforeRows.length === 0) return null;
          const before = beforeRows[0];

          const sets: string[] = [];
          const values: unknown[] = [];
          if (body.email !== undefined) {
            values.push(body.email.trim().toLowerCase());
            sets.push(`email = $${values.length}`);
          }
          if (body.name !== undefined) {
            values.push(body.name.trim());
            sets.push(`name = $${values.length}`);
          }
          if (body.role !== undefined) {
            values.push(body.role);
            sets.push(`role = $${values.length}`);
          }
          if (body.active !== undefined) {
            values.push(body.active);
            sets.push(`active = $${values.length}`);
          }
          values.push(id);

          const { rows: afterRows } = await tx.query(
            `UPDATE users SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING ${USER_COLUMNS}`,
            values
          );
          const after = afterRows[0];
          await recordAudit(tx, {
            userId: actorId,
            entityType: "user",
            entityId: id,
            action: "update",
            before,
            after,
          });
          return after;
        });

        if (!result) {
          reply.code(404).send({ error: "User not found" });
          return;
        }
        return result;
      } catch (err) {
        const message = friendlyConstraintMessage(err);
        if (message) {
          reply.code(400).send({ error: message });
          return;
        }
        throw err;
      }
    }
  );

  // Sets someone else's password directly - the "restore their password"
  // flow. There's no email/SMTP integration in this app to send a reset
  // link through, so an admin sets a temporary password here and passes it
  // to the person out of band; they can then change it themselves via
  // PATCH /api/auth/me/password. Never logs the password itself, only that
  // a reset happened.
  fastify.post(
    "/api/admin/users/:id/reset-password",
    { schema: resetPasswordSchema, preHandler: fastify.requireAdmin },
    async (request, reply) => {
      const id = Number((request.params as { id: string }).id);
      const body = request.body as { password: string };
      const actorId = request.user!.id;

      const passwordHash = await hashPassword(body.password);
      const result = await withTransaction(async (tx) => {
        const { rows } = await tx.query(`UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id`, [
          passwordHash,
          id,
        ]);
        if (rows.length === 0) return null;
        await recordAudit(tx, {
          userId: actorId,
          entityType: "user",
          entityId: id,
          action: "update",
          before: null,
          after: { event: "password_reset_by_admin" },
        });
        return rows[0];
      });

      if (!result) {
        reply.code(404).send({ error: "User not found" });
        return;
      }
      reply.code(204);
    }
  );
};

export default accountManagerRoutes;
