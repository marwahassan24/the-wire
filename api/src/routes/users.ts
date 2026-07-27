import type { FastifyPluginAsync } from "fastify";
import { pool } from "../db.js";

// Staff list for the client create/edit form's adviser and client-manager
// pickers - no dedicated endpoint existed before this; the form has no
// other way to know who's a valid adviser_id/cm_id. Read-only, no audit
// needed (nothing is written).
const usersRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/users", async () => {
    const { rows } = await pool.query(
      `SELECT id, name, role FROM users WHERE active = true ORDER BY name`
    );
    return rows;
  });
};

export default usersRoutes;
