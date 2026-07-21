import Fastify from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { env } from "./env.js";
import { pool } from "./db.js";
import authPlugin from "./plugins/auth.js";
import authRoutes from "./routes/auth.js";

const app = Fastify({ logger: true });

await app.register(cookie);
await app.register(rateLimit, { global: false });
await app.register(authPlugin);
await app.register(authRoutes);

app.get("/health", async () => {
  const { rows } = await pool.query<{ ok: number }>("select 1 as ok");
  return { status: "ok", db: rows[0].ok === 1 };
});

app
  .listen({ port: env.PORT, host: "0.0.0.0" })
  .then(() => app.log.info(`The Wire API listening on :${env.PORT}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
