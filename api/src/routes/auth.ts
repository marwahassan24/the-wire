import type { FastifyPluginAsync } from "fastify";
import { pool } from "../db.js";
import { verifyPassword, verifyAgainstDummyHash } from "../auth/password.js";
import { createSession, destroySession, SESSION_COOKIE } from "../auth/session.js";
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
        sameSite: "lax",
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
};

export default authRoutes;
