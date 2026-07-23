import type { ClientBundle, MoneyInfoClient } from "./types.js";

// The credentialed half of the sync: talks to the real moneyinfo API.
// Adapted from moneyinfo-sync.mjs's call()/retry/auth logic, restructured
// as a class so syncJob.ts can depend on the MoneyInfoClient interface
// instead of on fetch() directly. NONE OF THIS HAS BEEN EXERCISED AGAINST
// A REAL RESPONSE YET - no API access as of this build. See
// runMoneyInfoSync.ts for the "what to test once you have credentials"
// checklist.
//
// Read-only by construction: every call below is GET, except the one
// documented read-style POST /Clients/Search (a search, not a write).
// This class must never grow a POST/PUT/DELETE that isn't a read.

export interface HttpMoneyInfoClientConfig {
  apiUrl: string;
  apiKey: string;
  authScheme: "bearer" | "header";
  authHeader: string;
}

export class MoneyInfoAuthError extends Error {}

export class HttpMoneyInfoClient implements MoneyInfoClient {
  constructor(private readonly config: HttpMoneyInfoClientConfig) {}

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
    if (this.config.authScheme === "bearer") headers.Authorization = `Bearer ${this.config.apiKey}`;
    else headers[this.config.authHeader] = this.config.apiKey;
    return headers;
  }

  private async call(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    { optional = false }: { optional?: boolean } = {}
  ): Promise<unknown> {
    const url = `${this.config.apiUrl.replace(/\/+$/, "")}${path}`;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(url, {
          method,
          headers: this.headers(),
          body: body ? JSON.stringify(body) : undefined,
        });
        if (res.status === 429 || res.status >= 500) {
          await new Promise((r) => setTimeout(r, 800 * attempt));
          continue;
        }
        if (res.status === 404 && optional) return null;
        if (res.status === 401 || res.status === 403) {
          throw new MoneyInfoAuthError(
            `${res.status} on ${method} ${path}. Two usual causes: the IP isn't whitelisted yet, or the auth scheme is wrong (try MONEYINFO_AUTH_SCHEME=header with MONEYINFO_AUTH_HEADER set per the SendSafely notes).`
          );
        }
        if (!res.ok) {
          if (optional) return null;
          const text = await res.text().catch(() => "");
          throw new Error(`${res.status} ${method} ${path} :: ${text.slice(0, 300)}`);
        }
        const contentType = res.headers.get("content-type") || "";
        return contentType.includes("json") ? res.json() : res.text();
      } catch (err) {
        if (err instanceof MoneyInfoAuthError) throw err;
        if (attempt === 3) {
          if (optional) return null;
          throw err;
        }
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
    return null;
  }

  async fetchSpec(): Promise<unknown> {
    return this.call("GET", "/docs/v1/spec.json", undefined, { optional: true });
  }

  async identify(): Promise<unknown | null> {
    return this.call("GET", "/Organisation/Operators/identify", undefined, { optional: true });
  }

  async searchClients(): Promise<unknown[]> {
    const result = await this.call("POST", "/Clients/Search", {}, { optional: true });
    return asListLocal(result);
  }

  async listServiceGroups(): Promise<unknown[]> {
    const result = await this.call("GET", "/Organisation/serviceGroups", undefined, { optional: true });
    return asListLocal(result);
  }

  async listServiceGroupClients(serviceGroupRef: string): Promise<unknown[]> {
    const result = await this.call("GET", `/Organisation/serviceGroup/${serviceGroupRef}/clients`, undefined, {
      optional: true,
    });
    return asListLocal(result);
  }

  async fetchClientBundle(clientId: string): Promise<ClientBundle> {
    const [core, std, contacts, dependants, employments, plans, investments, accounts, currency, threads] =
      await Promise.all([
        this.call("GET", `/Clients/${clientId}`, undefined, { optional: true }),
        this.call("GET", `/Clients/${clientId}/standardFields`, undefined, { optional: true }),
        this.call("GET", `/Clients/${clientId}/contacts`, undefined, { optional: true }),
        this.call("GET", `/Clients/${clientId}/dependants`, undefined, { optional: true }),
        this.call("GET", `/Clients/${clientId}/employments`, undefined, { optional: true }),
        this.call("GET", `/Clients/${clientId}/Plans`, undefined, { optional: true }),
        this.call("GET", `/Clients/${clientId}/Investments`, undefined, { optional: true }),
        this.call("GET", `/Clients/${clientId}/Accounts`, undefined, { optional: true }),
        this.call("GET", `/Clients/${clientId}/currencySummary`, undefined, { optional: true }),
        this.call("GET", `/Clients/${clientId}/threadSummaries`, undefined, { optional: true }),
      ]);
    return { core, std, contacts, dependants, employments, plans, investments, accounts, currency, threads };
  }
}

function asListLocal(r: unknown): unknown[] {
  if (Array.isArray(r)) return r;
  if (r && typeof r === "object") {
    const o = r as Record<string, unknown>;
    for (const key of ["items", "data", "results", "clients"]) {
      if (Array.isArray(o[key])) return o[key] as unknown[];
    }
  }
  return [];
}
