import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { theme as C } from "../theme.js";
import { api } from "../api.js";
import { fmtDate } from "../format.js";
import type { PrepPack } from "../types.js";
import { Card, Eyebrow, Pill } from "../components/ui.js";

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

  if (error) return <div style={{ color: C.red, fontSize: 13 }}>{error}</div>;
  if (!prep) return <div style={{ color: C.inkSoft, fontSize: 13 }}>Loading…</div>;

  return (
    <div>
      <Link to={`/clients/${prep.id}`} style={{ fontSize: 12.5, color: C.inkSoft, textDecoration: "none" }}>
        ← {prep.first_names} {prep.surname}
      </Link>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, marginBottom: 4 }}>
        <div style={{ fontWeight: 700, fontSize: 20 }}>Prep: {prep.first_names} {prep.surname}</div>
        <Pill tone={prep.status === "Working" ? "primary" : "plain"}>{prep.status}</Pill>
      </div>
      <div style={{ fontSize: 12.5, color: C.inkSoft, marginBottom: 24 }}>
        {prep.review_cycle} cycle
        {prep.next_review_date &&
          ` · next ${prep.next_review_type ?? "review"} ${fmtDate(prep.next_review_date)}`}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <Card>
          <Eyebrow>Open and carried points</Eyebrow>
          {prep.points.length === 0 && <Empty />}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {prep.points.map((p) => (
              <div key={p.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                  <span style={{ fontFamily: C.mono, fontSize: 11.5, color: C.inkSoft }}>#{p.number}</span>
                  <Pill tone={POINT_TONE[p.status]}>{p.status}</Pill>
                  {p.raised_context && <span style={{ fontSize: 11, color: C.inkSoft }}>{p.raised_context}</span>}
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
          <Eyebrow>Recent soft facts</Eyebrow>
          {prep.recentSoftFacts.length === 0 && <Empty />}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {prep.recentSoftFacts.map((f) => (
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
          <Eyebrow>Portfolio</Eyebrow>
          <div
            style={{ fontSize: 13.5, lineHeight: 1.55, marginBottom: prep.portfolio.recentLogs.length ? 16 : 0 }}
          >
            {prep.portfolio.summary || <Empty />}
          </div>
          {prep.portfolio.recentLogs.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {prep.portfolio.recentLogs.map((l) => (
                <div key={l.id} style={{ fontSize: 12.5, display: "flex", gap: 10 }}>
                  <span style={{ fontFamily: C.mono, color: C.inkSoft, flexShrink: 0 }}>{fmtDate(l.entry_date)}</span>
                  <span>{l.text}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <Eyebrow>Outstanding tasks</Eyebrow>
          {prep.outstandingTasks.length === 0 && <Empty />}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {prep.outstandingTasks.map((t) => (
              <div key={t.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                  <Pill tone={TASK_STATUS_TONE[t.status]}>{TASK_STATUS_LABEL[t.status]}</Pill>
                  <span style={{ fontSize: 11.5, color: C.inkSoft }}>
                    {t.owner_name}
                    {t.due_date && ` · due ${fmtDate(t.due_date)}`}
                  </span>
                </div>
                <div style={{ fontSize: 13.5 }}>{t.text}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <Eyebrow>Last Meeting Note</Eyebrow>
          {!prep.lastMeetingNote && <Empty />}
          {prep.lastMeetingNote && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: C.inkSoft }}>
                  {prep.lastMeetingNote.meeting_type} · {fmtDate(prep.lastMeetingNote.meeting_date)}
                </span>
                <Pill tone={prep.lastMeetingNote.status === "approved" ? "primary" : "amber"}>
                  {prep.lastMeetingNote.status}
                </Pill>
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
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
  return <div style={{ fontSize: 12.5, color: C.inkSoft, fontStyle: "italic" }}>Nothing here yet.</div>;
}
