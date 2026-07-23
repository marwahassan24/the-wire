// Shapes for the moneyinfo sync. Field names inside the *bundle* payloads
// are intentionally left as `unknown` - the real schemas live in
// /docs/v1/spec.json (fetch it with `--spec`) and haven't been checked
// against a live response yet. See mapping.ts for the best-guess field
// paths that will need correcting on first real contact.

// Everything the sync fetches for one client EXCEPT the search-result stub,
// which the caller already has in hand from searchClients() /
// listServiceGroupClients() and passes through separately.
export interface ClientBundle {
  core: unknown;
  std: unknown;
  contacts: unknown;
  dependants: unknown;
  employments: unknown;
  plans: unknown;
  investments: unknown;
  accounts: unknown;
  currency: unknown;
  threads: unknown;
}

export interface ClientStub {
  clientId: string;
  raw: unknown;
}

// The read-only surface the sync job needs from moneyinfo. Implemented for
// real by HttpMoneyInfoClient (needs credentials) and by a fixture client
// in tests (does not) - the job itself is written against this interface,
// never against fetch() directly, so it can be fully exercised without
// network access or an API key.
export interface MoneyInfoClient {
  identify(): Promise<unknown | null>;
  searchClients(): Promise<unknown[]>;
  listServiceGroups(): Promise<unknown[]>;
  listServiceGroupClients(serviceGroupRef: string): Promise<unknown[]>;
  fetchClientBundle(clientId: string): Promise<ClientBundle>;
}

export interface MappedClientFacts {
  moneyinfoClientId: string;
  firstNames: string;
  surname: string;
  dob: string | null;
  email: string | null;
  phone: string | null;
  status: "Working" | "Retired";
  portfolioSummary: string;
  threadCount: number;
  dependantCount: number;
}
