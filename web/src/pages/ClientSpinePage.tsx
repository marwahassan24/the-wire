import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { theme as C } from "../theme.js";
import { api } from "../api.js";
import { fmtDate } from "../format.js";
import type { Attachment, ClientSpine, MeetingNote, Point, SoftFact } from "../types.js";
import { Card, Pill, SectionHeading } from "../components/ui.js";
import { PointsSection } from "../components/PointsSection.js";
import { AttachmentsSection } from "../components/AttachmentsSection.js";
import { AssetAllocation } from "../components/AssetAllocation.js";
import { SoftFactsSection } from "../components/SoftFactsSection.js";
import { MeetingNoteSection } from "../components/MeetingNoteSection.js";

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

  if (error) return <div style={{ color: C.red, fontSize: C.text.small }}>{error}</div>;
  if (!client) return <div style={{ color: C.inkSoft, fontSize: C.text.small }}>Loading…</div>;

  return (
    <div>
      <Link to="/clients" style={{ fontSize: C.text.small, color: C.inkSoft, textDecoration: "none" }}>
        ← Clients
      </Link>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontWeight: 700, fontSize: C.text.title }}>
            {client.first_names} {client.surname}
          </div>
          <Pill tone={client.status === "Working" ? "primary" : "plain"}>{client.status}</Pill>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <Link
            to={`/clients/${client.id}/edit`}
            style={{ fontSize: C.text.small, color: C.inkSoft, textDecoration: "none", fontWeight: 600 }}
          >
            Edit
          </Link>
          <Link
            to={`/clients/${client.id}/prep`}
            style={{ fontSize: C.text.small, color: C.primary, textDecoration: "none", fontWeight: 600 }}
          >
            Prep view →
          </Link>
        </div>
      </div>
      <div style={{ fontSize: C.text.small, color: C.inkSoft, marginTop: 6, marginBottom: 32 }}>
        {client.review_cycle} cycle
        {client.next_review_date &&
          ` · next ${client.next_review_type ?? "review"} ${fmtDate(client.next_review_date)}`}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <SoftFactsSection
          clientId={client.id}
          softFacts={client.softFacts}
          onChange={(softFacts: SoftFact[]) => setClient({ ...client, softFacts })}
        />

        <PointsSection
          clientId={client.id}
          points={client.points}
          onChange={(points: Point[]) => setClient({ ...client, points })}
        />

        <MeetingNoteSection
          clientId={client.id}
          meetingNotes={client.meetingNotes}
          onChange={(meetingNotes: MeetingNote[]) => setClient({ ...client, meetingNotes })}
        />

        <Card>
          <SectionHeading>4. Portfolio detail</SectionHeading>
          <AssetAllocation holdings={client.portfolio.holdings} />
          <div style={{ fontSize: C.text.body, lineHeight: 1.6, marginBottom: client.portfolio.logs.length ? 20 : 0 }}>
            {client.portfolio.summary || <Empty />}
          </div>
          {client.portfolio.logs.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {client.portfolio.logs.map((l) => (
                <div key={l.id} style={{ fontSize: C.text.small, display: "flex", gap: 12 }}>
                  <span style={{ color: C.inkSoft, flexShrink: 0 }}>{fmtDate(l.entry_date)}</span>
                  <span style={{ color: C.ink }}>{l.text}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <AttachmentsSection
          clientId={client.id}
          attachments={client.attachments}
          onChange={(attachments: Attachment[]) => setClient({ ...client, attachments })}
        />
      </div>
    </div>
  );
}

function Empty() {
  return <div style={{ fontSize: C.text.small, color: C.inkSoft }}>Nothing here yet.</div>;
}
