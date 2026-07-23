import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { theme as C } from "../theme.js";
import { api } from "../api.js";
import { fmtDate } from "../format.js";
import type { ClientSummary } from "../types.js";
import { Card, Input, Pill } from "../components/ui.js";

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
      <div style={{ fontWeight: 700, fontSize: C.text.title, marginBottom: 24 }}>Clients</div>
      <Input
        placeholder="Search by name or email…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ marginBottom: 28, maxWidth: 400 }}
      />
      {error && <div style={{ color: C.red, fontSize: C.text.small }}>{error}</div>}
      {!clients && !error && <div style={{ color: C.inkSoft, fontSize: C.text.small }}>Loading…</div>}
      {clients && clients.length === 0 && (
        <div style={{ color: C.inkSoft, fontSize: C.text.small }}>No clients match.</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {clients?.map((c) => (
          <Link key={c.id} to={`/clients/${c.id}`} style={{ textDecoration: "none", color: "inherit" }}>
            <Card
              style={{
                padding: "20px 24px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: C.text.body }}>
                  {c.first_names} {c.surname}
                </div>
                <div style={{ fontSize: C.text.small, color: C.inkSoft, marginTop: 4 }}>
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
