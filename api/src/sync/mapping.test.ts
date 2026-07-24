import { test } from "node:test";
import assert from "node:assert/strict";
import { asList, gbp, mapClientBundle, mapHoldings, pick, REDACT } from "./mapping.js";
import type { ClientBundle } from "./types.js";

const emptyBundle: ClientBundle = {
  core: {},
  std: {},
  contacts: {},
  dependants: {},
  employments: {},
  plans: {},
  investments: {},
  accounts: {},
  currency: {},
  threads: {},
};

test("REDACT stays hard-on", () => {
  assert.equal(REDACT, true);
});

test("pick tries each dot-path in order and returns the first non-empty value", () => {
  assert.equal(pick({ a: { b: "found" } }, "a.b"), "found");
  assert.equal(pick({ a: "" }, "a", "b"), "");
  assert.equal(pick({ b: "second" }, "a", "b"), "second");
  assert.equal(pick({}, "missing"), "");
});

test("asList normalises the various response shapes moneyinfo might return", () => {
  assert.deepEqual(asList([1, 2]), [1, 2]);
  assert.deepEqual(asList({ items: [1] }), [1]);
  assert.deepEqual(asList({ data: [2] }), [2]);
  assert.deepEqual(asList({ results: [3] }), [3]);
  assert.deepEqual(asList({ clients: [4] }), [4]);
  assert.deepEqual(asList(null), []);
  assert.deepEqual(asList({}), []);
});

test("gbp formats numbers as GBP and passes through non-numbers", () => {
  assert.equal(gbp(12000), "£12,000");
  assert.equal(gbp(12000.4), "£12,000");
  assert.equal(gbp(null), "");
  assert.equal(gbp("already text"), "already text");
});

test("mapClientBundle redacts the surname to TESTCLIENT regardless of the real value", () => {
  const stub = { clientId: "123", firstName: "Chris", surname: "RealSurname" };
  const mapped = mapClientBundle("123", stub, emptyBundle);
  assert.equal(mapped.firstNames, "Chris");
  assert.equal(mapped.surname, "TESTCLIENT");
});

test("mapClientBundle falls back to 'Unknown' first name and empty dob/email/phone when nothing matches", () => {
  const mapped = mapClientBundle("456", {}, emptyBundle);
  assert.equal(mapped.firstNames, "Unknown");
  assert.equal(mapped.dob, null);
  assert.equal(mapped.email, null);
  assert.equal(mapped.phone, null);
});

test("mapClientBundle infers Working from an employment record and defaults to Retired otherwise", () => {
  const working = mapClientBundle("1", {}, {
    ...emptyBundle,
    employments: [{ employmentStatus: "Employed" }],
  });
  assert.equal(working.status, "Working");

  const retired = mapClientBundle("2", {}, { ...emptyBundle, employments: [{ employmentStatus: "Retired" }] });
  assert.equal(retired.status, "Retired");
});

test("mapClientBundle builds a portfolio summary line from plans and total value, with the verify caveat", () => {
  const bundle: ClientBundle = {
    ...emptyBundle,
    plans: [
      { planName: "Fidelity SIPP", currentValue: 250000 },
      { planName: "ISA", currentValue: 40000 },
    ],
    currency: { totalValue: 290000 },
  };
  const mapped = mapClientBundle("789", {}, bundle);
  assert.match(mapped.portfolioSummary, /Total \(moneyinfo\): £290,000\./);
  assert.match(mapped.portfolioSummary, /Fidelity SIPP £250,000; ISA £40,000/);
  assert.match(mapped.portfolioSummary, /adviser to verify before prep/);
  // Em dash caveat text ships as a plain hyphen already, so normalizeText
  // downstream is a no-op for this line - but nothing here should reintroduce one.
  assert.doesNotMatch(mapped.portfolioSummary, /—/);
});

test("mapClientBundle never produces soft facts, points, meeting notes or tasks fields", () => {
  const mapped = mapClientBundle("1", {}, emptyBundle) as unknown as Record<string, unknown>;
  for (const forbidden of ["softFacts", "points", "meetingNotes", "tasks"]) {
    assert.equal(forbidden in mapped, false, `mapClientBundle must never produce a '${forbidden}' field`);
  }
});

test("mapClientBundle counts threads and dependants but does not inline their content", () => {
  const bundle: ClientBundle = {
    ...emptyBundle,
    threads: [{ id: 1 }, { id: 2 }],
    dependants: [{ id: 1 }],
  };
  const mapped = mapClientBundle("1", {}, bundle);
  assert.equal(mapped.threadCount, 2);
  assert.equal(mapped.dependantCount, 1);
});

test("mapHoldings extracts provider, plan type, holding name, asset class and value from plans/investments/accounts", () => {
  const bundle: ClientBundle = {
    ...emptyBundle,
    plans: [
      {
        planId: "P1",
        planName: "Fidelity SIPP",
        planType: "SIPP",
        provider: "Fidelity",
        currentValue: 250000,
        assetClass: "Equity",
        valuationDate: "2026-06-01T00:00:00Z",
      },
    ],
    investments: [{ investmentId: "I1", fundName: "Global Equity Fund", assetClass: "Equity", value: 100000 }],
    accounts: [{ accountId: "A1", provider: "Barclays", balance: 5000 }],
  };

  const holdings = mapHoldings(bundle);
  assert.equal(holdings.length, 3);

  const plan = holdings.find((h) => h.source === "plan")!;
  assert.equal(plan.moneyinfoHoldingId, "P1");
  assert.equal(plan.provider, "Fidelity");
  assert.equal(plan.planType, "SIPP");
  assert.equal(plan.holdingName, "Fidelity SIPP");
  assert.equal(plan.assetClass, "Equity");
  assert.equal(plan.value, 250000);
  assert.equal(plan.currency, "GBP");
  assert.equal(plan.asOfDate, "2026-06-01");

  const investment = holdings.find((h) => h.source === "investment")!;
  assert.equal(investment.moneyinfoHoldingId, "I1");
  assert.equal(investment.holdingName, "Global Equity Fund");
  assert.equal(investment.value, 100000);

  const account = holdings.find((h) => h.source === "account")!;
  assert.equal(account.moneyinfoHoldingId, "A1");
  assert.equal(account.provider, "Barclays");
  assert.equal(account.value, 5000);
});

test("mapHoldings returns null (not a guessed default) for fields that aren't present", () => {
  const holdings = mapHoldings({ ...emptyBundle, plans: [{ planId: "P1" }] });
  assert.equal(holdings.length, 1);
  const [h] = holdings;
  assert.equal(h.provider, null);
  assert.equal(h.planType, null);
  assert.equal(h.holdingName, null);
  assert.equal(h.assetClass, null);
  assert.equal(h.value, null);
  assert.equal(h.asOfDate, null);
  assert.equal(h.currency, "GBP");
});

test("mapClientBundle attaches structured holdings alongside the text summary, not instead of it", () => {
  const bundle: ClientBundle = {
    ...emptyBundle,
    plans: [{ planName: "ISA", currentValue: 40000, assetClass: "Cash" }],
  };
  const mapped = mapClientBundle("1", {}, bundle);
  assert.equal(mapped.holdings.length, 1);
  assert.equal(mapped.holdings[0].assetClass, "Cash");
  assert.match(mapped.portfolioSummary, /ISA £40,000/);
});
