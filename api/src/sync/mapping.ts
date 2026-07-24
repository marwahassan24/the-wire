import type { ClientBundle, HoldingSource, MappedClientFacts, MappedHolding } from "./types.js";

// Surnames -> TESTCLIENT. Hard-on until the Verve ruling; not a flag on
// purpose (see moneyinfo-sync.mjs, which this module was adapted from).
export const REDACT = true;

// Field names below are best-effort against the moneyinfo endpoint list;
// the real property names live in spec.json (Client, ClientContactDetails,
// Plan, Investment, Employment...). Run the sync's --spec mode and correct
// these paths on first real staging contact - that's expected, not a
// failure, per the brief.
export function pick(obj: unknown, ...keys: string[]): string {
  for (const key of keys) {
    const value = key
      .split(".")
      .reduce<unknown>((o, p) => (o == null ? o : (o as Record<string, unknown>)[p]), obj);
    if (value !== undefined && value !== null && value !== "") return String(value);
  }
  return "";
}

export function asList(r: unknown): unknown[] {
  if (Array.isArray(r)) return r;
  if (r && typeof r === "object") {
    const o = r as Record<string, unknown>;
    for (const key of ["items", "data", "results", "clients"]) {
      if (Array.isArray(o[key])) return o[key] as unknown[];
    }
  }
  return [];
}

export function gbp(n: unknown): string {
  return typeof n === "number" ? `£${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}` : String(n ?? "");
}

const orNull = (s: string): string | null => (s === "" ? null : s);

// Structured holdings (one row per plan / investment / account), best-guess
// field paths against the endpoint list - same caveat as pick() above: run
// --spec and correct these once there's real staging access. asset_class in
// particular is a guess; moneyinfo may not expose it uniformly across plan
// types, hence it's nullable rather than required.
function mapHoldingsFromList(list: unknown[], source: HoldingSource): MappedHolding[] {
  return list.map((item) => {
    const valueRaw = pick(item, "currentValue", "value", "valuation", "totalValue", "marketValue", "balance");
    const dateRaw = pick(item, "valuationDate", "asOfDate", "date", "lastValuedDate");
    return {
      moneyinfoHoldingId: orNull(pick(item, "planId", "investmentId", "accountId", "id", "ref")),
      source,
      provider: orNull(pick(item, "provider.name", "providerName", "provider", "planProvider")),
      planType: orNull(pick(item, "planType", "type", "productType", "wrapperType")),
      holdingName: orNull(pick(item, "planName", "name", "fundName", "holdingName", "description")),
      assetClass: orNull(pick(item, "assetClass", "assetType", "sector", "category")),
      value: valueRaw !== "" ? Number(valueRaw) : null,
      currency: pick(item, "currency", "currencyCode") || "GBP",
      asOfDate: orNull(dateRaw.slice(0, 10)),
      raw: item,
    };
  });
}

export function mapHoldings(bundle: ClientBundle): MappedHolding[] {
  return [
    ...mapHoldingsFromList(asList(bundle.plans), "plan"),
    ...mapHoldingsFromList(asList(bundle.investments), "investment"),
    ...mapHoldingsFromList(asList(bundle.accounts), "account"),
  ];
}

// Pure transformation from a raw moneyinfo response bundle to the fields
// the sync job is allowed to write: basic client facts, structured
// portfolio holdings, and a portfolio summary line. Deliberately produces
// nothing for soft facts, points, meeting notes or tasks - those are
// adviser narrative and this function has no way to author them, by
// design.
export function mapClientBundle(clientId: string, stub: unknown, bundle: ClientBundle): MappedClientFacts {
  const src = {
    ...(typeof stub === "object" && stub ? stub : {}),
    ...(typeof bundle.core === "object" && bundle.core ? bundle.core : {}),
  };

  const first = pick(src, "firstName", "forename", "forenames", "givenName", "name.first");
  const last = pick(src, "surname", "lastName", "familyName", "name.last");
  const emps = asList(bundle.employments);
  const working = emps.some((e) => /employ|self/i.test(pick(e, "employmentStatus", "status", "type")));

  const holdings = mapHoldings(bundle);
  const planBits = holdings
    .filter((h) => h.source === "plan")
    .map((h) => [h.holdingName, h.value !== null ? gbp(h.value) : null].filter(Boolean).join(" "))
    .filter(Boolean);
  const totalRaw = pick(bundle.currency, "totalValue", "total", "value", "summary.total");
  const summaryLine = [
    totalRaw !== "" ? `Total (moneyinfo): ${gbp(Number(totalRaw))}.` : null,
    planBits.length ? `Plans: ${planBits.join("; ")}.` : null,
    `Synced from moneyinfo ${new Date().toISOString().slice(0, 10)} - adviser to verify before prep.`,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    moneyinfoClientId: clientId,
    firstNames: first || "Unknown",
    surname: REDACT ? "TESTCLIENT" : last || "",
    dob: orNull(pick(src, "dateOfBirth", "dob", "birthDate").slice(0, 10)),
    email: orNull(pick(src, "email", "emailAddress", "contactDetails.email")),
    phone: orNull(pick(src, "phone", "mobile", "telephone", "contactDetails.mobile", "contactDetails.phone")),
    status: working ? "Working" : "Retired",
    portfolioSummary: summaryLine,
    holdings,
    threadCount: asList(bundle.threads).length,
    dependantCount: asList(bundle.dependants).length,
  };
}
