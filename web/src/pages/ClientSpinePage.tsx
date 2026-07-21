import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { theme as C } from "../theme.js";
import { api } from "../api.js";
import type { ClientSpine } from "../types.js";
import { Card, Eyebrow, Pill } from "../components/ui.js";

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const POINT_TONE = { open: "amber", carried: "amber", resolved: "plain" } as const;

export function ClientSpinePage() {
  const { id } = useParams<{ id: string }>();
  const [client, setClient] = useState<ClientSpine | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setClient(null);
    setError(null);
    api
      .get<ClientSpine>(`/api/clients/${id}`)
      .then(setClient)
      .catch(() => setError("Couldn't load this client."));
  }, [id]);

  if (error) return <div style={{ color: C.red, fontSize: 13 }}>{error}</div>;
  if (!client) return <div style={{ color: C.inkSoft, fontSize: 13 }}>Loading…</div>;

  const latestNote = client.meetingNotes[0];

  return (
    <div>
      <Link to="/clients" style={{ fontSize: 12.5, color: C.inkSoft, textDecoration: "none" }}>
        ← Clients
      </Link>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, marginBottom: 4 }}>
        <div style={{ fontWeight: 700, fontSize: 20 }}>
          {client.first_names} {client.surname}
        </div>
        <Pill tone={client.status === "Working" ? "primary" : "plain"}>{client.status}</Pill>
      </div>
      <div style={{ fontSize: 12.5, color: C.inkSoft, marginBottom: 24 }}>
        {client.review_cycle} cycle
        {client.next_review_date &&
          ` · next ${client.next_review_type ?? "review"} ${fmtDate(client.next_review_date)}`}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <Card>
          <Eyebrow>1 · Soft facts</Eyebrow>
          {client.softFacts.length === 0 && <Empty />}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {client.softFacts.map((f) => (
              <div key={f.id}>
                <div style={{ fontSize: 11, color: C.inkSoft, fontFamily: C.mono, marginBottom: 2 }}>
                  {fmtDate(f.fact_date)}
                </div>
                <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>{f.text}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <Eyebrow>2 · Points to note / discuss</Eyebrow>
          {client.points.length === 0 && <Empty />}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {client.points.map((p) => (
              <div key={p.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                  <span style={{ fontFamily: C.mono, fontSize: 11.5, color: C.inkSoft }}>#{p.number}</span>
                  <Pill tone={POINT_TONE[p.status]}>{p.status}</Pill>
                  {p.raised_context && (
                    <span style={{ fontSize: 11, color: C.inkSoft }}>{p.raised_context}</span>
                  )}
                </div>
                <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>{p.text}</div>
                {p.resolution_note && (
                  <div style={{ fontSize: 12.5, color: C.inkSoft, marginTop: 3 }}>↳ {p.resolution_note}</div>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <Eyebrow>3 · Meeting Note (client-visible)</Eyebrow>
          {!latestNote && <Empty />}
          {latestNote && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: C.inkSoft }}>
                  {latestNote.meeting_type} · {fmtDate(latestNote.meeting_date)}
                </span>
                <Pill tone={latestNote.status === "approved" ? "primary" : "amber"}>{latestNote.status}</Pill>
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{latestNote.body}</div>
            </div>
          )}
        </Card>

        <Card>
          <Eyebrow>4 · Portfolio detail</Eyebrow>
          <div style={{ fontSize: 13.5, lineHeight: 1.55, marginBottom: client.portfolio.logs.length ? 16 : 0 }}>
            {client.portfolio.summary || <Empty />}
          </div>
          {client.portfolio.logs.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {client.portfolio.logs.map((l) => (
                <div key={l.id} style={{ fontSize: 12.5, display: "flex", gap: 10 }}>
                  <span style={{ fontFamily: C.mono, color: C.inkSoft, flexShrink: 0 }}>{fmtDate(l.entry_date)}</span>
                  <span>{l.text}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Empty() {
  return <div style={{ fontSize: 12.5, color: C.inkSoft, fontStyle: "italic" }}>Nothing here yet.</div>;
}
