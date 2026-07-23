import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { theme as C } from "../theme.js";
import { api } from "../api.js";
import { fmtDate } from "../format.js";
import type { PrepPack } from "../types.js";
import { Card, Pill, SectionHeading } from "../components/ui.js";

const POINT_TONE = { open: "amber", carried: "amber", resolved: "plain" } as const;
const TASK_STATUS_TONE = { awaiting_sense_check: "amber", confirmed: "primary", done: "plain" } as const;
const TASK_STATUS_LABEL: Record<string, string> = {
  awaiting_sense_check: "awaiting sense-check",
  confirmed: "confirmed",
  done: "done",
};

export function PrepPage() {
  const { id } = useParams<{ id: string }>();
  const [prep, setPrep] = useState<PrepPack | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPrep(null);
    setError(null);
    api
      .get<PrepPack>(`/api/clients/${id}/prep`)
      .then(setPrep)
      .catch(() => setError("Couldn't load the prep pack for this client."));
  }, [id]);

  if (error) return <div style={{ color: C.red, fontSize: C.text.small }}>{error}</div>;
  if (!prep) return <div style={{ color: C.inkSoft, fontSize: C.text.small }}>Loading…</div>;

  return (
    <div>
      <Link to={`/clients/${prep.id}`} style={{ fontSize: C.text.small, color: C.inkSoft, textDecoration: "none" }}>
        ← {prep.first_names} {prep.surname}
      </Link>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
        <div style={{ fontWeight: 700, fontSize: C.text.title }}>
          Prep: {prep.first_names} {prep.surname}
        </div>
        <Pill tone={prep.status === "Working" ? "primary" : "plain"}>{prep.status}</Pill>
      </div>
      <div style={{ fontSize: C.text.small, color: C.inkSoft, marginTop: 6, marginBottom: 32 }}>
        {prep.review_cycle} cycle
        {prep.next_review_date &&
          ` · next ${prep.next_review_type ?? "review"} ${fmtDate(prep.next_review_date)}`}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <Card>
          <SectionHeading>Open and carried points</SectionHeading>
          {prep.points.length === 0 && <Empty />}
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {prep.points.map((p) => (
              <div key={p.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: C.text.small, fontWeight: 600, color: C.inkSoft }}>#{p.number}</span>
                  <Pill tone={POINT_TONE[p.status]}>{p.status}</Pill>
                  {p.raised_context && (
                    <span style={{ fontSize: C.text.small, color: C.inkSoft }}>{p.raised_context}</span>
                  )}
                </div>
                <div style={{ fontSize: C.text.body, lineHeight: 1.6 }}>{p.text}</div>
                {p.resolution_note && (
                  <div style={{ fontSize: C.text.small, color: C.inkSoft, marginTop: 6 }}>
                    ↳ {p.resolution_note}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeading>Recent soft facts</SectionHeading>
          {prep.recentSoftFacts.length === 0 && <Empty />}
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {prep.recentSoftFacts.map((f) => (
              <div key={f.id}>
                <div style={{ fontSize: C.text.small, color: C.inkSoft, marginBottom: 4 }}>
                  {fmtDate(f.fact_date)}
                </div>
                <div style={{ fontSize: C.text.body, lineHeight: 1.6 }}>{f.text}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeading>Portfolio</SectionHeading>
          <div
            style={{
              fontSize: C.text.body,
              lineHeight: 1.6,
              marginBottom: prep.portfolio.recentLogs.length ? 20 : 0,
            }}
          >
            {prep.portfolio.summary || <Empty />}
          </div>
          {prep.portfolio.recentLogs.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {prep.portfolio.recentLogs.map((l) => (
                <div key={l.id} style={{ fontSize: C.text.small, display: "flex", gap: 12 }}>
                  <span style={{ color: C.inkSoft, flexShrink: 0 }}>{fmtDate(l.entry_date)}</span>
                  <span style={{ color: C.ink }}>{l.text}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <SectionHeading>Outstanding tasks</SectionHeading>
          {prep.outstandingTasks.length === 0 && <Empty />}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {prep.outstandingTasks.map((t) => (
              <div key={t.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <Pill tone={TASK_STATUS_TONE[t.status]}>{TASK_STATUS_LABEL[t.status]}</Pill>
                  <span style={{ fontSize: C.text.small, color: C.inkSoft }}>
                    {t.owner_name}
                    {t.due_date && ` · due ${fmtDate(t.due_date)}`}
                  </span>
                </div>
                <div style={{ fontSize: C.text.body, lineHeight: 1.5 }}>{t.text}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeading>Last meeting note</SectionHeading>
          {!prep.lastMeetingNote && <Empty />}
          {prep.lastMeetingNote && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: C.text.small, color: C.inkSoft }}>
                  {prep.lastMeetingNote.meeting_type} · {fmtDate(prep.lastMeetingNote.meeting_date)}
                </span>
                <Pill tone={prep.lastMeetingNote.status === "approved" ? "primary" : "amber"}>
                  {prep.lastMeetingNote.status}
                </Pill>
              </div>
              <div style={{ fontSize: C.text.body, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {prep.lastMeetingNote.body}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Empty() {
  return <div style={{ fontSize: C.text.small, color: C.inkSoft }}>Nothing here yet.</div>;
}
