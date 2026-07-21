import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { theme as C } from "../theme.js";
import { api } from "../api.js";
import type { ClientSummary } from "../types.js";
import { Card, Input, Pill } from "../components/ui.js";

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function ClientsListPage() {
  const [clients, setClients] = useState<ClientSummary[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    const handle = setTimeout(() => {
      api
        .get<ClientSummary[]>(`/api/clients?${params.toString()}`)
        .then(setClients)
        .catch(() => setError("Couldn't load clients."));
    }, 200);
    return () => clearTimeout(handle);
  }, [q]);

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 16 }}>Clients</div>
      <Input
        placeholder="Search by name or email…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ marginBottom: 20, maxWidth: 360 }}
      />
      {error && <div style={{ color: C.red, fontSize: 13 }}>{error}</div>}
      {!clients && !error && <div style={{ color: C.inkSoft, fontSize: 13 }}>Loading…</div>}
      {clients && clients.length === 0 && (
        <div style={{ color: C.inkSoft, fontSize: 13 }}>No clients match.</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {clients?.map((c) => (
          <Link key={c.id} to={`/clients/${c.id}`} style={{ textDecoration: "none", color: "inherit" }}>
            <Card style={{ padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {c.first_names} {c.surname}
                </div>
                <div style={{ fontSize: 12.5, color: C.inkSoft, marginTop: 2 }}>
                  {c.review_cycle} cycle
                  {c.next_review_date && ` · next review ${fmtDate(c.next_review_date)}`}
                </div>
              </div>
              <Pill tone={c.status === "Working" ? "primary" : "plain"}>{c.status}</Pill>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
