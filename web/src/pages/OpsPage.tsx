import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { theme as C } from "../theme.js";
import { api } from "../api.js";
import { fmtDate } from "../format.js";
import type { OpsCase, OpsDashboard } from "../types.js";
import { Btn, Card, Pill, SectionHeading } from "../components/ui.js";

function Stat({ n, label, tone }: { n: number; label: string; tone?: string }) {
  return (
    <Card style={{ padding: "20px 16px", textAlign: "center" }}>
      <div style={{ fontSize: 28, fontWeight: 800, color: tone ?? C.primary, lineHeight: 1.1 }}>{n}</div>
      <div style={{ fontSize: C.text.small, color: C.inkSoft, marginTop: 8 }}>{label}</div>
    </Card>
  );
}

function reviewPill(daysUntil: number) {
  if (daysUntil < 0) return <Pill tone="red">overdue {Math.abs(daysUntil)}d</Pill>;
  if (daysUntil <= 14) return <Pill tone="amber">in {daysUntil}d, prep now</Pill>;
  return <Pill tone="plain">in {daysUntil}d</Pill>;
}

export function OpsPage() {
  const [dashboard, setDashboard] = useState<OpsDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  function loadDashboard() {
    return api
      .get<OpsDashboard>("/api/ops/dashboard")
      .then(setDashboard)
      .catch(() => setError("Couldn't load the operations dashboard."));
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  if (error) return <div style={{ color: C.red, fontSize: C.text.small }}>{error}</div>;
  if (!dashboard) return <div style={{ color: C.inkSoft, fontSize: C.text.small }}>Loading…</div>;

  const { stats, reviewsDue, pipeline, workload } = dashboard;

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: C.text.title, marginBottom: 8 }}>Operations</div>
      <div style={{ fontSize: C.text.small, color: C.inkSoft, marginBottom: 28 }}>
        Reviews, live cases and team load, driven by the same spine, nothing entered twice.
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
          gap: 14,
          marginBottom: 36,
        }}
      >
        <Stat n={stats.reviewsOverdue} label="Reviews overdue" tone={stats.reviewsOverdue ? C.red : undefined} />
        <Stat n={stats.reviewsDueSoon} label="Reviews next 6 weeks" />
        <Stat n={stats.reviewsNoDateSet} label="No review date" tone={stats.reviewsNoDateSet ? C.amber : undefined} />
        <Stat n={stats.liveCases} label="Live cases" />
        <Stat n={stats.withProvider} label="With provider" tone={C.mauve} />
        <Stat n={stats.withClient} label="With client" tone={C.mauve} />
        <Stat n={stats.stalledCases} label="Stalled 14 days+" tone={stats.stalledCases ? C.red : undefined} />
      </div>

      <SectionHeading>Reviews due</SectionHeading>
      <Card style={{ marginBottom: 36 }}>
        {reviewsDue.length === 0 && <Empty text="No review dates set yet." />}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {reviewsDue.map((r) => (
            <div
              key={r.id}
              style={{
                display: "flex",
                gap: 14,
                alignItems: "baseline",
                padding: "14px 0",
                borderTop: `1px solid ${C.line}`,
                flexWrap: "wrap",
              }}
            >
              <Link
                to={`/clients/${r.id}`}
                style={{ fontWeight: 600, fontSize: C.text.body, color: C.primary, textDecoration: "none", minWidth: 180 }}
              >
                {r.first_names} {r.surname}
              </Link>
              <span style={{ fontSize: C.text.small, color: C.inkSoft, flex: 1 }}>
                {r.next_review_type ?? "Review"} · {fmtDate(r.next_review_date)} · {r.review_cycle} cycle ·{" "}
                {r.adviser_name}
              </span>
              {reviewPill(r.days_until)}
            </div>
          ))}
        </div>
        {stats.reviewsNoDateSet > 0 && (
          <div
            style={{
              marginTop: 16,
              paddingTop: 14,
              borderTop: `1px solid ${C.line}`,
              fontSize: C.text.small,
              color: C.amber,
            }}
          >
            {stats.reviewsNoDateSet} client{stats.reviewsNoDateSet > 1 ? "s have" : " has"} no next review date set.
          </div>
        )}
      </Card>

      <SectionHeading>Case pipeline</SectionHeading>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 14,
          marginBottom: 36,
        }}
      >
        {pipeline.map(({ stage, count, cases }, stageIndex) => (
          <Card key={stage} style={{ padding: 18, opacity: count ? 1 : 0.7 }}>
            <div
              style={{
                fontSize: C.text.small,
                fontWeight: 600,
                color: stage === "Completed" ? C.mauve : C.primary,
                marginBottom: 12,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>{stage}</span>
              <span>{count}</span>
            </div>
            {count === 0 && <Empty text="Nothing here." />}
            {cases.map((k) => (
              <CaseCard
                key={k.id}
                kase={k}
                stage={stage}
                nextStage={pipeline[stageIndex + 1]?.stage}
                onAdvanced={loadDashboard}
              />
            ))}
          </Card>
        ))}
      </div>

      <SectionHeading>Team workload</SectionHeading>
      <Card>
        {workload.length === 0 && <Empty text="No active staff." />}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {workload.map((w) => (
            <div
              key={w.id}
              style={{
                display: "flex",
                gap: 16,
                alignItems: "center",
                padding: "14px 0",
                borderTop: `1px solid ${C.line}`,
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontWeight: 600, fontSize: C.text.body, minWidth: 110 }}>{w.name}</span>
              <div
                style={{
                  flex: "1 1 160px",
                  height: 8,
                  background: C.primarySoft,
                  borderRadius: 4,
                  overflow: "hidden",
                  minWidth: 100,
                }}
              >
                <div
                  style={{
                    width: `${Math.min(100, w.open_tasks * 12)}%`,
                    height: "100%",
                    background: w.overdue_tasks ? C.pink : C.primary,
                  }}
                />
              </div>
              <span style={{ fontSize: C.text.small, color: C.inkSoft }}>
                {w.open_tasks} open · {w.open_cases} case{w.open_cases === 1 ? "" : "s"}
              </span>
              {w.overdue_tasks > 0 && <Pill tone="red">{w.overdue_tasks} overdue</Pill>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div style={{ fontSize: C.text.small, color: C.inkSoft }}>{text}</div>;
}

function CaseCard({
  kase,
  stage,
  nextStage,
  onAdvanced,
}: {
  kase: OpsCase;
  stage: string;
  nextStage: string | undefined;
  onAdvanced: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function advance() {
    if (!nextStage) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.patch(`/api/cases/${kase.id}`, { stage: nextStage });
      // Re-fetch the whole dashboard rather than hand-patching pipeline
      // counts and stats (liveCases, stalledCases, etc.) locally - those
      // are all derived server-side from the same case list, and trying
      // to keep every derived number in sync client-side is exactly the
      // kind of thing that quietly drifts wrong.
      await onAdvanced();
    } catch {
      setError("Couldn't advance that case.");
      setSubmitting(false);
    }
  }

  return (
    <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 12, marginTop: 12 }}>
      <Link
        to={`/clients/${kase.client_id}`}
        style={{ fontWeight: 600, fontSize: C.text.small, color: C.primary, textDecoration: "none" }}
      >
        {kase.client_first_names} {kase.client_surname}
      </Link>
      <div style={{ fontSize: C.text.small, margin: "4px 0 10px", lineHeight: 1.5 }}>{kase.title}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {kase.waiting_on && <Pill tone="plain">with {kase.waiting_on}</Pill>}
        {stage !== "Completed" && kase.idle_days > 14 && <Pill tone="red">stalled {kase.idle_days}d</Pill>}
      </div>
      {nextStage && (
        <Btn tone="ghost" small disabled={submitting} onClick={advance} style={{ marginTop: 10 }}>
          Advance → {nextStage}
        </Btn>
      )}
      {error && <div style={{ fontSize: C.text.small, color: C.red, marginTop: 6 }}>{error}</div>}
    </div>
  );
}
