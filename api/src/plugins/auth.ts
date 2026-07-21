import fp from "fastify-plugin";
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { getUserForToken, SESSION_COOKIE, type SessionUser } from "../auth/session.js";

declare module "fastify" {
  interface FastifyRequest {
    user: SessionUser | null;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
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
};

export default fp(authPlugin);
