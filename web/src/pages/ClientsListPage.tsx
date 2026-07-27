import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { theme as C } from "../theme.js";
import { api } from "../api.js";
import { fmtDate } from "../format.js";
import type { ClientSummary, StaffUser } from "../types.js";
import { Btn, Card, Input, Pill, Select } from "../components/ui.js";

const DECADES = [20, 30, 40, 50, 60, 70, 80, 90];

export function ClientsListPage() {
  const [clients, setClients] = useState<ClientSummary[] | null>(null);
  const [q, setQ] = useState("");
  const [decade, setDecade] = useState("");
  const [status, setStatus] = useState("");
  const [adviser, setAdviser] = useState("");
  const [reviewDue, setReviewDue] = useState(false);
  const [advisers, setAdvisers] = useState<StaffUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<StaffUser[]>("/api/users")
      .then((all) => setAdvisers(all.filter((u) => u.role === "adviser")))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (decade) params.set("decade", decade);
    if (status) params.set("status", status);
    if (adviser) params.set("adviser", adviser);
    if (reviewDue) params.set("review_due", "true");
    const handle = setTimeout(() => {
      api
        .get<ClientSummary[]>(`/api/clients?${params.toString()}`)
        .then(setClients)
        .catch(() => setError("Couldn't load clients."));
    }, 200);
    return () => clearTimeout(handle);
  }, [q, decade, status, adviser, reviewDue]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div style={{ fontWeight: 700, fontSize: C.text.title }}>Clients</div>
        <Link to="/clients/new" style={{ textDecoration: "none" }}>
          <Btn tone="ink" small>
            + New client
          </Btn>
        </Link>
      </div>
      <Input
        placeholder="Search by name or email…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ marginBottom: 16, maxWidth: 400 }}
      />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 28 }}>
        <Select value={decade} onChange={setDecade} placeholder="Any decade">
          {DECADES.map((d) => (
            <option key={d} value={d}>
              {d}s
            </option>
          ))}
        </Select>
        <Select value={status} onChange={setStatus} placeholder="Any status">
          <option value="Working">Working</option>
          <option value="Retired">Retired</option>
        </Select>
        <Select value={adviser} onChange={setAdviser} placeholder="Any adviser">
          {advisers.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: C.text.small,
            color: C.inkSoft,
            cursor: "pointer",
          }}
        >
          <input type="checkbox" checked={reviewDue} onChange={(e) => setReviewDue(e.target.checked)} />
          Review due
        </label>
        {(decade || status || adviser || reviewDue) && (
          <Btn
            tone="ghost"
            small
            onClick={() => {
              setDecade("");
              setStatus("");
              setAdviser("");
              setReviewDue(false);
            }}
          >
            Clear filters
          </Btn>
        )}
      </div>
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
