#!/usr/bin/env tsx
/* ============================================================================
   THE WIRE - moneyinfo sync (server-side, Postgres, READ-ONLY, staging-only)

   Adapted from moneyinfo-sync.mjs (step 8's file-based script) into a job
   that writes straight to the Wire database instead of a JSON file. See
   syncJob.ts for exactly what it writes and what it refuses to touch.

   NOT YET TESTED AGAINST A REAL RESPONSE
   ---------------------------------------------------------------------------
   There is no moneyinfo API access at the time this was built. Everything
   in mapping.ts / syncJob.ts is exercised by automated tests using fixture
   data (npm test), so the Postgres-writing logic is verified. What is NOT
   verified, and needs checking on first real staging contact:

     1. Auth: does MONEYINFO_AUTH_SCHEME=bearer work, or does staging want
        header auth (MONEYINFO_AUTH_HEADER)? A 401/403 here says which.
     2. Field mappings in mapping.ts's pick() calls are best-guesses against
        the endpoint list, not the real schema. Run --spec below, open
        wire-sync-output/moneyinfo-spec.json, and correct the pick() paths
        for Client / ClientContactDetails / Plan / Investment / Employment.
     3. Whether POST /Clients/Search with an empty body actually returns
        client stubs, or needs a body shape (e.g. { page: 1 }) - the
        service-groups fallback in syncJob.ts exists for exactly this case.
     4. Whether the moneyinfo_client_id values on any existing Wire clients
        actually match what the API returns as clientId/id/ref - if none
        match, every stub will report as "unmatched" on first run, which is
        expected until IDs are linked, not a bug.
     5. Rate limiting / retry behaviour under real load - the retry/backoff
        in httpMoneyInfoClient.ts is carried over from the file-based
        script but has only run against nothing.

   Usage
   -----
     export MONEYINFO_API_KEY="...from SendSafely..."
     npm run sync:moneyinfo --workspace=api -- --spec     # fetch spec.json for schema-checking
     npm run sync:moneyinfo --workspace=api               # sync first 5 matched clients
     npm run sync:moneyinfo --workspace=api -- --limit 20

   This job is staging-only by design - see BUILD-BRIEF.md. There is no
   --live flag: pushing this to live moneyinfo data is a deliberate,
   separate, held-for-confirm build, not this one.
   ============================================================================ */

import { writeFileSync, mkdirSync } from "node:fs";
import { pool } from "../db.js";
import { HttpMoneyInfoClient } from "./httpMoneyInfoClient.js";
import { runMoneyInfoSync } from "./syncJob.js";

const STAGING_URL = "https://staging8moneyinfoapi.midev1.co.uk";
const args = process.argv.slice(2);
const has = (flag: string) => args.includes(flag);
const argVal = (flag: string, fallback: string) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

function fail(msg: string): never {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

async function main() {
  const apiUrl = (process.env.MONEYINFO_API_URL || STAGING_URL).replace(/\/+$/, "");
  const apiKey = process.env.MONEYINFO_API_KEY || "";
  const authScheme = (process.env.MONEYINFO_AUTH_SCHEME || "bearer").toLowerCase();
  const authHeader = process.env.MONEYINFO_AUTH_HEADER || "X-Api-Key";
  const limit = has("--all") ? Infinity : parseInt(argVal("--limit", "5"), 10);

  if (!/staging/i.test(apiUrl)) {
    fail(
      `This job is staging-only by design (see BUILD-BRIEF.md). MONEYINFO_API_URL does not look like a staging URL:\n  ${apiUrl}\nLive sync is a deliberate, separate, held-for-confirm build - not this one.`
    );
  }
  if (authScheme !== "bearer" && authScheme !== "header") {
    fail(`MONEYINFO_AUTH_SCHEME must be "bearer" or "header", got "${authScheme}".`);
  }
  if (!apiKey) {
    fail(
      "MONEYINFO_API_KEY is not set - no credentials yet, so there is nothing to sync against. Get it from SendSafely and export it in your shell; never commit it. The Postgres-writing logic itself is covered by `npm test` (see syncJob.test.ts) without needing this."
    );
  }

  const client = new HttpMoneyInfoClient({ apiUrl, apiKey, authScheme: authScheme as "bearer" | "header", authHeader });

  if (has("--spec")) {
    const spec = await client.fetchSpec();
    if (!spec) fail("Couldn't fetch /docs/v1/spec.json - check whitelist/credentials.");
    const outDir = "./wire-sync-output";
    mkdirSync(outDir, { recursive: true });
    writeFileSync(`${outDir}/moneyinfo-spec.json`, typeof spec === "string" ? spec : JSON.stringify(spec, null, 2));
    console.log(`✓ Spec saved to ${outDir}/moneyinfo-spec.json - check it against the pick() paths in mapping.ts.`);
    await pool.end();
    return;
  }

  console.log(`\nThe Wire - moneyinfo sync (read-only, staging)\n  url: ${apiUrl}\n  limit: ${limit === Infinity ? "all" : limit}\n`);

  const result = await runMoneyInfoSync(client, { limit: limit === Infinity ? undefined : limit });

  console.log(`✓ ${result.stubCount} client stub(s) found from moneyinfo; processed ${result.processed}.\n`);

  if (result.updated.length) {
    console.log(`Updated (${result.updated.length}):`);
    for (const u of result.updated) console.log(`  ✓ ${u.name} (moneyinfo ${u.moneyinfoClientId} -> Wire client ${u.clientId})`);
  }
  if (result.unmatched.length) {
    console.log(`\nUnmatched - not linked in Wire yet (${result.unmatched.length}):`);
    for (const u of result.unmatched) console.log(`  · ${u.name} (moneyinfo ${u.moneyinfoClientId}) - ${u.reason}`);
  }
  if (result.errors.length) {
    console.log(`\nErrors (${result.errors.length}):`);
    for (const e of result.errors) console.log(`  ✗ ${e.moneyinfoClientId}: ${e.message}`);
  }

  console.log(
    `\nRaw bundles (incl. thread messages) saved to moneyinfo_raw_sync for the ${result.updated.length} updated client(s) - for the later Phase 2 extraction step, not read by this sync.`
  );
  console.log("Reminder: soft facts, points and meeting notes were not touched - those stay adviser-authored.\n");

  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
