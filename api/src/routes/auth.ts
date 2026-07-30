import type { FastifyPluginAsync } from "fastify";
import { pool, withTransaction } from "../db.js";
import { verifyPassword, verifyAgainstDummyHash, hashPassword } from "../auth/password.js";
import { createSession, destroySession, SESSION_COOKIE } from "../auth/session.js";
import { recordAudit } from "../audit.js";
import { env } from "../env.js";

interface UserRow {
  id: number;
  email: string;
  name: string;
  role: string;
  password_hash: string;
  active: boolean;
}

const loginSchema = {
  body: {
    type: "object",
    required: ["email", "password"],
    properties: {
      email: { type: "string", minLength: 1 },
      password: { type: "string", minLength: 1 },
    },
    additionalProperties: false,
  },
};

const changePasswordSchema = {
  body: {
    type: "object",
    required: ["currentPassword", "newPassword"],
    properties: {
      currentPassword: { type: "string", minLength: 1 },
      newPassword: { type: "string", minLength: 8 },
    },
    additionalProperties: false,
  },
};

const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/api/auth/login",
    {
      schema: loginSchema,
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const { email, password } = request.body as { email: string; password: string };
      const normalizedEmail = email.trim().toLowerCase();

      const { rows } = await pool.query<UserRow>(
        `SELECT id, email, name, role, password_hash, active FROM users WHERE email = $1`,
        [normalizedEmail]
      );
      const user = rows[0];

      // Always run a verify, even on a miss, so response time doesn't reveal
      // whether the email exists.
      const passwordOk = user
        ? await verifyPassword(user.password_hash, password)
        : await verifyAgainstDummyHash(password);

      if (!user || !user.active || !passwordOk) {
        reply.code(401).send({ error: "Invalid email or password" });
        return;
      }

      const { token, expiresAt } = await createSession(user.id);
      await pool.query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [user.id]);

      reply.setCookie(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        // The deployed web and api sites live on different Render
        // hostnames, so this is a cross-site request from the browser's
        // point of view - SameSite=Lax would silently drop the cookie on
        // every fetch() call after login (Lax only rides along on
        // top-level navigations). None requires Secure, which is already
        // conditional on production above; locally (http, same-site
        // localhost ports) Lax stays correct and doesn't need Secure.
        sameSite: env.NODE_ENV === "production" ? "none" : "lax",
        path: "/",
        expires: expiresAt,
      });

      return { id: user.id, email: user.email, name: user.name, role: user.role };
    }
  );

  fastify.post("/api/auth/logout", async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) {
      await destroySession(token);
    }
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  fastify.get("/api/auth/me", { preHandler: fastify.authenticate }, async (request) => {
    return request.user;
  });

  // Self-service password change - requires the current password so a
  // session left open on a shared machine can't silently be used to lock
  // the real owner out. Distinct from the admin reset-password route
  // (accountManager.ts), which sets someone else's password directly with
  // no current-password check, for exactly the "I forgot it" case this
  // route can't help with.
  fastify.patch(
    "/api/auth/me/password",
    { schema: changePasswordSchema, preHandler: fastify.authenticate },
    async (request, reply) => {
      const { currentPassword, newPassword } = request.body as { currentPassword: string; newPassword: string };
      const userId = request.user!.id;

      const { rows } = await pool.query<{ password_hash: string }>(`SELECT password_hash FROM users WHERE id = $1`, [
        userId,
      ]);
      const currentHash = rows[0]?.password_hash;
      if (!currentHash || !(await verifyPassword(currentHash, currentPassword))) {
        reply.code(400).send({ error: "Current password is incorrect." });
        return;
      }

      const newHash = await hashPassword(newPassword);
      await withTransaction(async (tx) => {
        await tx.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [newHash, userId]);
        await recordAudit(tx, {
          userId,
          entityType: "user",
          entityId: userId,
          action: "update",
          before: null,
          after: { event: "password_changed_by_user" },
        });
      });

      reply.code(204);
    }
  );
};

export default authRoutes;
