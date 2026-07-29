import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { pool } from "../db.js";

let app: FastifyInstance;

before(async () => {
  app = await buildApp();
  await app.ready();
  // Isolate from anything the other test files (or a stray manual run)
  // leave behind, so the week/total assertions below are exact.
  await pool.query(`DELETE FROM ai_assistant_usage`);
});

after(async () => {
  await pool.query(`DELETE FROM ai_assistant_usage`);
  await app.close();
  await pool.end();
});

test("logging usage needs no session - the tool's iframe calls this cross-origin without cookies", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/api/ai-assistant/usage",
    payload: { mode: "reply", model: "claude" },
  });
  assert.equal(res.statusCode, 204);

  const { rows } = await pool.query(`SELECT mode, model, user_id FROM ai_assistant_usage`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].mode, "reply");
  assert.equal(rows[0].model, "claude");
  assert.equal(rows[0].user_id, null);
});

test("mode and model are optional", async () => {
  const res = await app.inject({ method: "POST", url: "/api/ai-assistant/usage", payload: {} });
  assert.equal(res.statusCode, 204);
});

test("an unrecognised body field is rejected, not silently dropped", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/api/ai-assistant/usage",
    payload: { mode: "reply", clientMessage: "should never be accepted here" },
  });
  assert.equal(res.statusCode, 400);
});

test("stats reports week and total counts across every logged row", async () => {
  await app.inject({ method: "POST", url: "/api/ai-assistant/usage", payload: { mode: "escalate", model: "chatgpt" } });
  await app.inject({ method: "POST", url: "/api/ai-assistant/usage", payload: { mode: "internal", model: "claude" } });

  const { rows } = await pool.query<{ count: string }>(`SELECT count(*) FROM ai_assistant_usage`);
  const expectedTotal = Number(rows[0].count);

  const res = await app.inject({ method: "GET", url: "/api/ai-assistant/usage/stats" });
  assert.equal(res.statusCode, 200);
  const stats = res.json();
  // Every row in this test file was just logged, so they're all within
  // the current ISO week too - week and total should agree.
  assert.equal(stats.total, expectedTotal);
  assert.equal(stats.week, expectedTotal);
});
