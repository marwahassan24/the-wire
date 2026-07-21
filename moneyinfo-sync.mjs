#!/usr/bin/env node
/* ============================================================================
   THE WIRE — moneyinfo sync (v0.1, staging-first, READ-ONLY)
   TCFP · run via Claude Code · Node 18+ · no dependencies

   What this does
   --------------
   Pulls client data from the moneyinfo API and writes a JSON file in the
   Wire shape — { "clients": [...] } — ready to paste into The Wire's
   Data → Import panel.

   What this script will NEVER do (by design, per the brief + Jeremy's rulings)
   ---------------------------------------------------------------------------
   1. WRITE to moneyinfo. Read-only. No POST/PUT/DELETE except the documented
      read-style POST /Clients/Search. Posting Meeting Notes back (isInternal)
      is a later, separate, held-for-confirm build.
   2. AUTHOR the human sections. Soft facts, Points to note, and Meeting Notes
      are the adviser's narrative — the firm's judgement, not machine output.
      This sync fills basic facts + Portfolio detail only, and leaves the
      human sections empty for the adviser. Thread messages (the after-call
      actions) are saved to a raw sidecar for a LATER extraction step with
      human sense-check — never injected into the Living Document directly.
   3. TOUCH LIVE without you meaning it. Live requires --live, keeps surname
      redaction ON, and prints the Verve reminder: a searchable record of the
      whole client list is a data-protection event that needs the ruling
      before it leaves TCFP machines. Keep live output local.

   The document stays master. This is a feed INTO the spine, never the spine.

   Usage
   -----
     export MONEYINFO_API_KEY="...from SendSafely — never commit, never paste into Claude project..."
     node moneyinfo-sync.mjs --spec               # download spec.json so Claude Code can read the real schemas
     node moneyinfo-sync.mjs                      # staging, first 5 clients, surnames redacted
     node moneyinfo-sync.mjs --limit 20
     node moneyinfo-sync.mjs --all
     node moneyinfo-sync.mjs --live --limit 1     # live needs the explicit flag; redaction stays ON

   Optional env:
     MONEYINFO_API_URL          default: https://staging8moneyinfoapi.midev1.co.uk
     MONEYINFO_AUTH_SCHEME      "bearer" (default) | "header"
     MONEYINFO_AUTH_HEADER      header name when scheme=header, e.g. "X-Api-Key"
   Check the SendSafely message for how credentials are meant to be sent and
   set the scheme to match. If calls 401, that's the first thing to fix.
   ============================================================================ */

import { writeFileSync, mkdirSync } from "node:fs";

/* ----------------------------- config ------------------------------------ */
const STAGING_URL = "https://staging8moneyinfoapi.midev1.co.uk";
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const argVal = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

const LIVE = has("--live");
const BASE = (process.env.MONEYINFO_API_URL || STAGING_URL).replace(/\/+$/, "");
const KEY = process.env.MONEYINFO_API_KEY || "";
const SCHEME = (process.env.MONEYINFO_AUTH_SCHEME || "bearer").toLowerCase();
const AUTH_HEADER = process.env.MONEYINFO_AUTH_HEADER || "X-Api-Key";
const LIMIT = has("--all") ? Infinity : parseInt(argVal("--limit", "5"), 10);
const REDACT = true; // surnames -> TESTCLIENT. Hard-on until the Verve ruling; not a flag on purpose.
const OUT_DIR = "./wire-sync-output";
const RAW_DIR = `${OUT_DIR}/raw`;

if (LIVE && BASE === STAGING_URL) {
  fail("--live passed but MONEYINFO_API_URL still points at staging. Set the live URL from the SendSafely message.");
}
if (!LIVE && BASE !== STAGING_URL) {
  fail(`Refusing: MONEYINFO_API_URL is not the staging URL but --live was not passed.\n  URL: ${BASE}\n  Add --live only when you mean it.`);
}
if (!KEY) fail("MONEYINFO_API_KEY is not set. Get it from SendSafely; export it in your shell. Never commit it.");

if (LIVE) {
  console.log("\n  ┌─ LIVE ENVIRONMENT ──────────────────────────────────────────────┐");
  console.log("  │ Verve reminder: the whole-spine data-protection question is      │");
  console.log("  │ parked for Jeremy. Surname redaction is ON and cannot be turned  │");
  console.log("  │ off. Keep the output on TCFP machines — do not upload it to      │");
  console.log("  │ claude.ai, the shared project, or any third-party service.       │");
  console.log("  └──────────────────────────────────────────────────────────────────┘\n");
}

/* ----------------------------- http -------------------------------------- */
const headers = { "Content-Type": "application/json", Accept: "application/json" };
if (SCHEME === "bearer") headers["Authorization"] = `Bearer ${KEY}`;
else headers[AUTH_HEADER] = KEY;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, path, body, { optional = false } = {}) {
  const url = `${BASE}${path}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
      if (res.status === 429 || res.status >= 500) { await sleep(800 * attempt); continue; }
      if (res.status === 404 && optional) return null;
      if (res.status === 401 || res.status === 403) {
        fail(`${res.status} on ${method} ${path}. Two usual causes: your IP isn't whitelisted yet, or the auth scheme is wrong (try MONEYINFO_AUTH_SCHEME=header and set MONEYINFO_AUTH_HEADER per the SendSafely notes).`);
      }
      if (!res.ok) {
        if (optional) return null;
        const text = await res.text().catch(() => "");
        throw new Error(`${res.status} ${method} ${path} :: ${text.slice(0, 300)}`);
      }
      const ct = res.headers.get("content-type") || "";
      return ct.includes("json") ? res.json() : res.text();
    } catch (e) {
      if (attempt === 3) { if (optional) return null; throw e; }
      await sleep(500 * attempt);
    }
  }
  return null;
}

function fail(msg) { console.error(`\n✗ ${msg}\n`); process.exit(1); }

/* ----------------------------- spec mode ---------------------------------- */
if (has("--spec")) {
  const spec = await call("GET", "/docs/v1/spec.json", null, { optional: true });
  if (!spec) fail("Couldn't fetch /docs/v1/spec.json — check whitelist/credentials.");
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(`${OUT_DIR}/moneyinfo-spec.json`, typeof spec === "string" ? spec : JSON.stringify(spec, null, 2));
  console.log(`✓ Spec saved to ${OUT_DIR}/moneyinfo-spec.json — point Claude Code at it to check exact schemas (ClientSearchModel etc.).`);
  process.exit(0);
}

/* ----------------------------- helpers ------------------------------------ */
// Field names below are best-effort against the endpoint list; the real
// property names live in spec.json (Client, ClientContactDetails, Plan,
// Investment, Employment...). Run --spec and let Claude Code correct pick()
// paths on the first staging run — that's expected, not a failure.
const pick = (obj, ...keys) => {
  for (const k of keys) {
    const v = k.split(".").reduce((o, p) => (o == null ? o : o[p]), obj);
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return "";
};
const asList = (r) => (Array.isArray(r) ? r : r?.items || r?.data || r?.results || r?.clients || []);
const gbp = (n) => (typeof n === "number" ? `£${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}` : String(n ?? ""));

/* ----------------------------- pull -------------------------------------- */
console.log(`\nThe Wire — moneyinfo sync (read-only)\n  env: ${LIVE ? "LIVE" : "staging"}\n  url: ${BASE}\n  limit: ${LIMIT === Infinity ? "all" : LIMIT}\n`);

const who = await call("GET", "/Organisation/Operators/identify", null, { optional: true });
console.log(who ? `✓ Authenticated as operator: ${pick(who, "name", "displayName", "email", "operatorId") || "(id ok)"}` : "· /Organisation/Operators/identify not available — continuing.");

let clientStubs = asList(await call("POST", "/Clients/Search", {}, { optional: true }));
if (clientStubs.length === 0) {
  console.log("· POST /Clients/Search returned nothing with an empty body — trying service groups.");
  const groups = asList(await call("GET", "/Organisation/serviceGroups", null, { optional: true }));
  for (const g of groups) {
    const ref = pick(g, "serviceGroupRef", "ref", "id");
    if (!ref) continue;
    clientStubs.push(...asList(await call("GET", `/Organisation/serviceGroup/${ref}/clients`, null, { optional: true })));
  }
}
if (clientStubs.length === 0) fail("No clients returned. Fetch --spec and check ClientSearchModel — the search body probably needs a field like { page: 1 } or a name filter.");

console.log(`✓ ${clientStubs.length} client stub(s) found; pulling detail for ${Math.min(LIMIT, clientStubs.length)}.\n`);

mkdirSync(RAW_DIR, { recursive: true });
const wireClients = [];
let n = 0;

for (const stub of clientStubs) {
  if (n >= LIMIT) break;
  const clientId = pick(stub, "clientId", "id", "ref");
  if (!clientId) continue;
  n++;

  const [core, std, contacts, dependants, employments, plans, investments, accounts, currency, threads] = await Promise.all([
    call("GET", `/Clients/${clientId}`, null, { optional: true }),
    call("GET", `/Clients/${clientId}/standardFields`, null, { optional: true }),
    call("GET", `/Clients/${clientId}/contacts`, null, { optional: true }),
    call("GET", `/Clients/${clientId}/dependants`, null, { optional: true }),
    call("GET", `/Clients/${clientId}/employments`, null, { optional: true }),
    call("GET", `/Clients/${clientId}/Plans`, null, { optional: true }),
    call("GET", `/Clients/${clientId}/Investments`, null, { optional: true }),
    call("GET", `/Clients/${clientId}/Accounts`, null, { optional: true }),
    call("GET", `/Clients/${clientId}/currencySummary`, null, { optional: true }),
    call("GET", `/Clients/${clientId}/threadSummaries`, null, { optional: true }),
  ]);

  // raw sidecar: everything, untouched, for the LATER extraction step
  // (after-call actions -> carry-forwards is an AI + human-sense-check job,
  // not a sync job — see brief: "factual extraction ... likely fine" but
  // it lands as suggestions, never straight into the Living Document)
  writeFileSync(`${RAW_DIR}/client-${clientId}.json`, JSON.stringify({ stub, core, std, contacts, dependants, employments, plans, investments, accounts, currency, threads }, null, 2));

  const src = { ...(typeof stub === "object" ? stub : {}), ...(typeof core === "object" ? core : {}) };
  const first = pick(src, "firstName", "forename", "forenames", "givenName", "name.first");
  const last = pick(src, "surname", "lastName", "familyName", "name.last");
  const emps = asList(employments);
  const working = emps.some((e) => /employ|self/i.test(String(pick(e, "employmentStatus", "status", "type"))));

  const planBits = asList(plans).map((p) => {
    const name = pick(p, "planName", "name", "planType", "type", "provider.name", "planProvider");
    const val = pick(p, "currentValue", "value", "valuation", "totalValue");
    return [name, val !== "" ? gbp(val) : null].filter(Boolean).join(" ");
  }).filter(Boolean);
  const total = pick(currency, "totalValue", "total", "value", "summary.total");
  const summaryLine = [
    total !== "" ? `Total (moneyinfo): ${gbp(total)}.` : null,
    planBits.length ? `Plans: ${planBits.join("; ")}.` : null,
    `Synced from moneyinfo ${new Date().toISOString().slice(0, 10)} — adviser to verify before prep.`,
  ].filter(Boolean).join(" ");

  wireClients.push({
    id: `mi-${clientId}`,
    firstName: first || "Unknown",
    surname: REDACT ? "TESTCLIENT" : (last || ""),
    dob: String(pick(src, "dateOfBirth", "dob", "birthDate")).slice(0, 10),
    dob2: "",
    email: pick(src, "email", "emailAddress", "contactDetails.email"),
    phone: pick(src, "phone", "mobile", "telephone", "contactDetails.mobile", "contactDetails.phone"),
    status: working ? "Working" : "Retired",
    adviser: pick(src, "consultant", "consultantDetails.name", "adviser"),
    cm: "",
    nextMeeting: { date: "", type: "Annual" },
    // Human sections stay empty on purpose — the adviser owns the narrative.
    softFacts: [],
    points: [],
    meetingNotes: [],
    portfolio: { summary: summaryLine, logs: [] },
    tasks: [],
    _mi: { clientId, dependants: asList(dependants).length, threads: asList(threads).length },
  });

  console.log(`  ✓ ${first || clientId} ${REDACT ? "TESTCLIENT" : last} — ${planBits.length} plan(s), ${asList(threads).length} thread(s)`);
  await sleep(250); // be polite to their API
}

/* ----------------------------- write ------------------------------------- */
const outFile = `${OUT_DIR}/the-wire-import-${new Date().toISOString().slice(0, 10)}.json`;
writeFileSync(outFile, JSON.stringify({ clients: wireClients }, null, 2));

console.log(`\n✓ ${wireClients.length} client(s) written to ${outFile}`);
console.log(`  Raw per-client responses in ${RAW_DIR}/ (for schema checking + the later extraction step).`);
console.log(`  Next: open The Wire → Data → paste the file's contents → Import.`);
if (LIVE) console.log(`  LIVE data: keep ${OUT_DIR}/ on this machine. Do not upload it anywhere until the Verve ruling.\n`);
else console.log("");
