import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../db.js";
import { hashPassword } from "../auth/password.js";
import { runMoneyInfoSync } from "./syncJob.js";
import type { ClientBundle, MoneyInfoClient } from "./types.js";

// Proves the sync job's Postgres-writing logic end to end without any real
// moneyinfo credentials or network access - a FixtureMoneyInfoClient stands
// in for HttpMoneyInfoClient, satisfying the same interface. This is the
// "can run without credentials" requirement: everything except the actual
// HTTP calls in httpMoneyInfoClient.ts is exercised here.

let userId: number;
let matchedClientId: number;
let otherClientId: number;

const MATCHED_MI_ID = "mi-matched-1";
const UNMATCHED_MI_ID = "mi-unmatched-99";

function makeBundle(overrides: Partial<ClientBundle> = {}): ClientBundle {
  return {
    core: {},
    std: {},
    contacts: {},
    dependants: [{ id: 1 }],
    employments: [{ employmentStatus: "Employed" }],
    plans: [{ planName: "Fidelity SIPP", currentValue: 100000 }],
    investments: {},
    accounts: {},
    currency: { totalValue: 100000 },
    threads: [{ id: 1, subject: "After-call action" }, { id: 2, subject: "Follow up" }],
    ...overrides,
  };
}

class FixtureMoneyInfoClient implements MoneyInfoClient {
  constructor(
    private readonly stubs: unknown[],
    private readonly bundles: Record<string, ClientBundle>,
    private readonly failFor: Set<string> = new Set()
  ) {}

  async identify() {
    return null;
  }
  async searchClients() {
    return this.stubs;
  }
  async listServiceGroups() {
    return [];
  }
  async listServiceGroupClients() {
    return [];
  }
  async fetchClientBundle(clientId: string): Promise<ClientBundle> {
    if (this.failFor.has(clientId)) throw new Error(`simulated failure for ${clientId}`);
    return this.bundles[clientId] ?? makeBundle();
  }
}

before(async () => {
  const email = `sync-test-${Date.now()}@tcfp.test`;
  const passwordHash = await hashPassword("test-password-123");
  const { rows: userRows } = await pool.query<{ id: number }>(
    `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, 'Sync Test Adviser', 'adviser') RETURNING id`,
    [email, passwordHash]
  );
  userId = userRows[0].id;

  const { rows: clientRows } = await pool.query<{ id: number }>(
    `INSERT INTO clients (moneyinfo_client_id, first_names, surname, status, adviser_id, cm_id, review_cycle)
     VALUES ($1, 'Original Name', 'TESTCLIENT', 'Working', $2, $2, 'Annual') RETURNING id`,
    [MATCHED_MI_ID, userId]
  );
  matchedClientId = clientRows[0].id;

  const { rows: otherRows } = await pool.query<{ id: number }>(
    `INSERT INTO clients (first_names, surname, status, adviser_id, cm_id, review_cycle)
     VALUES ('Unrelated', 'TESTCLIENT', 'Working', $1, $1, 'Annual') RETURNING id`,
    [userId]
  );
  otherClientId = otherRows[0].id;
});

after(async () => {
  await pool.query(
    `DELETE FROM audit_log WHERE entity_type IN ('client', 'portfolio_summary', 'portfolio_holdings', 'moneyinfo_raw_sync')
    AND entity_id IN ($1, $2)`,
    [matchedClientId, otherClientId]
  );
  await pool.query(`DELETE FROM moneyinfo_raw_sync WHERE client_id IN ($1, $2)`, [matchedClientId, otherClientId]);
  await pool.query(`DELETE FROM portfolio_holdings WHERE client_id IN ($1, $2)`, [matchedClientId, otherClientId]);
  await pool.query(`DELETE FROM portfolio_summary WHERE client_id IN ($1, $2)`, [matchedClientId, otherClientId]);
  await pool.query(`DELETE FROM clients WHERE id IN ($1, $2)`, [matchedClientId, otherClientId]);
  await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
  await pool.query(`UPDATE users SET active = false WHERE id = $1`, [userId]);
  await pool.end();
});

test("updates basic facts and portfolio summary for a matched client, and never touches adviser-owned tables", async () => {
  const stub = { clientId: MATCHED_MI_ID, firstName: "Jane", surname: "RealSurname" };
  const bundle = makeBundle();
  const client = new FixtureMoneyInfoClient([stub], { [MATCHED_MI_ID]: bundle });

  const result = await runMoneyInfoSync(client, { limit: 10 });

  assert.equal(result.updated.length, 1);
  assert.equal(result.updated[0].moneyinfoClientId, MATCHED_MI_ID);
  assert.equal(result.updated[0].clientId, matchedClientId);
  assert.equal(result.unmatched.length, 0);
  assert.equal(result.errors.length, 0);

  const { rows } = await pool.query(
    `SELECT first_names, surname, status, adviser_id, cm_id, review_cycle, version FROM clients WHERE id = $1`,
    [matchedClientId]
  );
  const row = rows[0];
  assert.equal(row.first_names, "Jane");
  // TESTCLIENT redaction stays on regardless of what moneyinfo returns.
  assert.equal(row.surname, "TESTCLIENT");
  assert.equal(row.status, "Working");
  // Firm-judgement fields are never touched by the sync.
  assert.equal(row.adviser_id, userId);
  assert.equal(row.cm_id, userId);
  assert.equal(row.review_cycle, "Annual");
  assert.equal(row.version, 2);

  const { rows: portfolioRows } = await pool.query(
    `SELECT summary, updated_by FROM portfolio_summary WHERE client_id = $1`,
    [matchedClientId]
  );
  assert.match(portfolioRows[0].summary, /Total \(moneyinfo\): £100,000\./);
  assert.match(portfolioRows[0].summary, /Fidelity SIPP £100,000/);
  // updated_by NULL marks this as a machine write, distinct from an adviser edit.
  assert.equal(portfolioRows[0].updated_by, null);

  const { rows: softFacts } = await pool.query(`SELECT id FROM soft_facts WHERE client_id = $1`, [matchedClientId]);
  const { rows: points } = await pool.query(`SELECT id FROM points WHERE client_id = $1`, [matchedClientId]);
  const { rows: meetingNotes } = await pool.query(`SELECT id FROM meeting_notes WHERE client_id = $1`, [
    matchedClientId,
  ]);
  assert.equal(softFacts.length, 0, "sync must never write soft facts");
  assert.equal(points.length, 0, "sync must never write points");
  assert.equal(meetingNotes.length, 0, "sync must never write meeting notes");
});

test("stores the raw bundle including thread messages, outside the spine, for the later extraction step", async () => {
  const stub = { clientId: MATCHED_MI_ID, firstName: "Jane" };
  const bundle = makeBundle({ threads: [{ id: 1, subject: "Call recap" }] });
  const client = new FixtureMoneyInfoClient([stub], { [MATCHED_MI_ID]: bundle });

  await runMoneyInfoSync(client, { limit: 10 });

  const { rows } = await pool.query(
    `SELECT raw FROM moneyinfo_raw_sync WHERE client_id = $1 ORDER BY id DESC LIMIT 1`,
    [matchedClientId]
  );
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].raw.threads, [{ id: 1, subject: "Call recap" }]);
  assert.deepEqual(rows[0].raw.stub, stub);
});

test("audit entries for sync writes carry a null user_id to mark them as machine-authored", async () => {
  const stub = { clientId: MATCHED_MI_ID, firstName: "Jane" };
  const client = new FixtureMoneyInfoClient([stub], { [MATCHED_MI_ID]: makeBundle() });

  await runMoneyInfoSync(client, { limit: 10 });

  const { rows } = await pool.query(
    `SELECT entity_type, user_id FROM audit_log
      WHERE entity_type IN ('client', 'portfolio_summary', 'portfolio_holdings', 'moneyinfo_raw_sync') AND entity_id = $1
      ORDER BY id DESC LIMIT 1`,
    [matchedClientId]
  );
  assert.ok(rows.length >= 1);
  for (const row of rows) assert.equal(row.user_id, null);
});

test("writes structured portfolio_holdings rows with provider, plan type, asset class and value", async () => {
  const stub = { clientId: MATCHED_MI_ID };
  const bundle = makeBundle({
    plans: [
      {
        planId: "P1",
        planName: "Fidelity SIPP",
        planType: "SIPP",
        provider: "Fidelity",
        currentValue: 250000,
        assetClass: "Equity",
      },
    ],
    investments: [{ investmentId: "I1", fundName: "Global Bond Fund", assetClass: "Bond", value: 50000 }],
    accounts: [{ accountId: "A1", provider: "Barclays", balance: 5000 }],
  });
  const client = new FixtureMoneyInfoClient([stub], { [MATCHED_MI_ID]: bundle });

  await runMoneyInfoSync(client, { limit: 10 });

  const { rows } = await pool.query(
    `SELECT moneyinfo_holding_id, source, provider, plan_type, holding_name, asset_class, value, currency
       FROM portfolio_holdings WHERE client_id = $1 ORDER BY source`,
    [matchedClientId]
  );
  assert.equal(rows.length, 3);

  const account = rows.find((r) => r.source === "account");
  assert.equal(account.moneyinfo_holding_id, "A1");
  assert.equal(account.provider, "Barclays");
  assert.equal(Number(account.value), 5000);

  const investment = rows.find((r) => r.source === "investment");
  assert.equal(investment.holding_name, "Global Bond Fund");
  assert.equal(investment.asset_class, "Bond");
  assert.equal(Number(investment.value), 50000);

  const plan = rows.find((r) => r.source === "plan");
  assert.equal(plan.provider, "Fidelity");
  assert.equal(plan.plan_type, "SIPP");
  assert.equal(plan.asset_class, "Equity");
  assert.equal(Number(plan.value), 250000);
  assert.equal(plan.currency, "GBP");
});

test("re-syncing a client replaces portfolio_holdings wholesale rather than accumulating duplicates", async () => {
  const stub = { clientId: MATCHED_MI_ID };
  const firstRun = new FixtureMoneyInfoClient([stub], {
    [MATCHED_MI_ID]: makeBundle({ plans: [{ planId: "P1", planName: "Old Plan", currentValue: 1000 }] }),
  });
  await runMoneyInfoSync(firstRun, { limit: 10 });

  const secondRun = new FixtureMoneyInfoClient([stub], {
    [MATCHED_MI_ID]: makeBundle({ plans: [{ planId: "P2", planName: "New Plan", currentValue: 2000 }] }),
  });
  await runMoneyInfoSync(secondRun, { limit: 10 });

  const { rows } = await pool.query(
    `SELECT moneyinfo_holding_id, holding_name FROM portfolio_holdings WHERE client_id = $1`,
    [matchedClientId]
  );
  assert.equal(rows.length, 1, "old holdings must be replaced, not accumulated, on each sync run");
  assert.equal(rows[0].moneyinfo_holding_id, "P2");
  assert.equal(rows[0].holding_name, "New Plan");
});

test("a stub with no matching Wire client is reported unmatched and never inserted", async () => {
  const stub = { clientId: UNMATCHED_MI_ID, firstName: "Not", surname: "InWireYet" };
  const client = new FixtureMoneyInfoClient([stub], {});

  const { rows: before } = await pool.query(`SELECT count(*) FROM clients`);

  const result = await runMoneyInfoSync(client, { limit: 10 });

  assert.equal(result.updated.length, 0);
  assert.equal(result.unmatched.length, 1);
  assert.equal(result.unmatched[0].moneyinfoClientId, UNMATCHED_MI_ID);
  assert.match(result.unmatched[0].reason, /moneyinfo_client_id/);
  assert.equal(result.unmatched[0].name, "Not TESTCLIENT");

  const { rows: after } = await pool.query(`SELECT count(*) FROM clients`);
  assert.equal(after[0].count, before[0].count, "sync must never create a new clients row");
});

test("limit caps how many stubs are processed in one run", async () => {
  const stubs = [
    { clientId: MATCHED_MI_ID },
    { clientId: "mi-extra-1" },
    { clientId: "mi-extra-2" },
  ];
  const client = new FixtureMoneyInfoClient(stubs, { [MATCHED_MI_ID]: makeBundle() });

  const result = await runMoneyInfoSync(client, { limit: 1 });
  assert.equal(result.processed, 1);
});

test("falls back to service groups when Clients/Search returns nothing", async () => {
  class FallbackClient implements MoneyInfoClient {
    async identify() {
      return null;
    }
    async searchClients() {
      return [];
    }
    async listServiceGroups() {
      return [{ serviceGroupRef: "sg-1" }];
    }
    async listServiceGroupClients(ref: string) {
      assert.equal(ref, "sg-1");
      return [{ clientId: MATCHED_MI_ID }];
    }
    async fetchClientBundle() {
      return makeBundle();
    }
  }

  const result = await runMoneyInfoSync(new FallbackClient(), { limit: 10 });
  assert.equal(result.updated.length, 1);
  assert.equal(result.updated[0].moneyinfoClientId, MATCHED_MI_ID);
});

test("a failure fetching one client's bundle is reported and rolls back cleanly, without touching other clients", async () => {
  const stub = { clientId: MATCHED_MI_ID };
  const client = new FixtureMoneyInfoClient([stub], {}, new Set([MATCHED_MI_ID]));

  const { rows: beforeVersion } = await pool.query(`SELECT version FROM clients WHERE id = $1`, [matchedClientId]);

  const result = await runMoneyInfoSync(client, { limit: 10 });

  assert.equal(result.updated.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /simulated failure/);

  const { rows: afterVersion } = await pool.query(`SELECT version FROM clients WHERE id = $1`, [matchedClientId]);
  assert.equal(afterVersion[0].version, beforeVersion[0].version, "a failed fetch must not partially update the client");
});
