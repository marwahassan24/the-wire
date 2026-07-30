import fp from "fastify-plugin";
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { getUserForToken, SESSION_COOKIE, type SessionUser } from "../auth/session.js";

declare module "fastify" {
  interface FastifyRequest {
    user: SessionUser | null;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

// Every route that needs a logged-in user adds { preHandler: fastify.authenticate }.
// It never trusts the cookie value itself — it's just a lookup key into sessions.
const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest("user", null);

  fastify.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.cookies[SESSION_COOKIE];
    const user = token ? await getUserForToken(token) : null;
    if (!user) {
      reply.clearCookie(SESSION_COOKIE, { path: "/" });
      reply.code(401).send({ error: "Unauthenticated" });
      return;
    }
    request.user = user;
  });

  // Account management (create/edit/deactivate accounts, reset someone
  // else's password) is admin-only. Always used alongside authenticate
  // (either the protected group's hook or an explicit preHandler), so
  // request.user is already populated by the time this runs.
  fastify.decorate("requireAdmin", async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user?.role !== "admin") {
      reply.code(403).send({ error: "Admin access required" });
      return;
    }
  });
};

export default fp(authPlugin);
