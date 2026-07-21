import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { env } from "./env.js";
import { pool } from "./db.js";
import authPlugin from "./plugins/auth.js";
import authRoutes from "./routes/auth.js";
import clientsRoutes from "./routes/clients.js";
import softFactsRoutes from "./routes/softFacts.js";
import pointsRoutes from "./routes/points.js";
import meetingNotesRoutes from "./routes/meetingNotes.js";
import portfolioRoutes from "./routes/portfolio.js";

export async function buildApp(): Promise<FastifyInstance> {
  // Fastify's default ajv config silently strips unknown body/query fields
  // (removeAdditional: true) instead of rejecting them. Turned off so a
  // request with a field a schema doesn't recognise gets a clear 400
  // instead of the extra field just vanishing without a trace.
  const app = Fastify({
    logger: env.NODE_ENV !== "test",
    ajv: { customOptions: { removeAdditional: false } },
  });

  await app.register(cors, {
    origin: env.WEB_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
  });
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await app.register(authPlugin);
  await app.register(authRoutes);

  // Every endpoint below requires a session (per the brief's API section).
  await app.register(async (protectedRoutes) => {
    protectedRoutes.addHook("preHandler", app.authenticate);
    await protectedRoutes.register(clientsRoutes);
    await protectedRoutes.register(softFactsRoutes);
    await protectedRoutes.register(pointsRoutes);
    await protectedRoutes.register(meetingNotesRoutes);
    await protectedRoutes.register(portfolioRoutes);
  });

  app.get("/health", async () => {
    const { rows } = await pool.query<{ ok: number }>("select 1 as ok");
    return { status: "ok", db: rows[0].ok === 1 };
  });

  return app;
}
