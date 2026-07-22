import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { theme as C } from "../theme.js";
import { api } from "../api.js";
import { fmtDate } from "../format.js";
import type { OpsDashboard } from "../types.js";
import { Card, Pill } from "../components/ui.js";

function Stat({ n, label, tone }: { n: number; label: string; tone?: string }) {
  return (
    <Card style={{ padding: 14, textAlign: "center" }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: tone ?? C.primary, lineHeight: 1.1 }}>{n}</div>
      <div
        style={{
          fontFamily: C.mono,
          fontSize: 10,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: C.inkSoft,
          marginTop: 4,
        }}
      >
        {label}
      </div>
    </Card>
  );
}

function reviewPill(daysUntil: number) {
  if (daysUntil < 0) return <Pill tone="red">overdue {Math.abs(daysUntil)}d</Pill>;
  if (daysUntil <= 14) return <Pill tone="amber">in {daysUntil}d — prep now</Pill>;
  return <Pill tone="plain">in {daysUntil}d</Pill>;
}

export function OpsPage() {
  const [dashboard, setDashboard] = useState<OpsDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<OpsDashboard>("/api/ops/dashboard")
      .then(setDashboard)
      .catch(() => setError("Couldn't load the operations dashboard."));
  }, []);

  if (error) return <div style={{ color: C.red, fontSize: 13 }}>{error}</div>;
  if (!dashboard) return <div style={{ color: C.inkSoft, fontSize: 13 }}>Loading…</div>;

  const { stats, reviewsDue, pipeline, workload } = dashboard;

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 4 }}>Operations</div>
      <div style={{ fontSize: 12.5, color: C.inkSoft, marginBottom: 20 }}>
        Reviews, live cases and team load — driven by the same spine, nothing entered twice.
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: 10,
          marginBottom: 28,
        }}
      >
        <Stat n={stats.reviewsOverdue} label="Reviews overdue" tone={stats.reviewsOverdue ? C.red : undefined} />
        <Stat n={stats.reviewsDueSoon} label="Reviews next 6wks" />
        <Stat n={stats.reviewsNoDateSet} label="No review date" tone={stats.reviewsNoDateSet ? C.amber : undefined} />
        <Stat n={stats.liveCases} label="Live cases" />
        <Stat n={stats.withProvider} label="With provider" tone={C.mauve} />
        <Stat n={stats.withClient} label="With client" tone={C.mauve} />
        <Stat n={stats.stalledCases} label="Stalled 14d+" tone={stats.stalledCases ? C.red : undefined} />
      </div>

      <SectionTitle>Reviews due</SectionTitle>
      <Card style={{ marginBottom: 28 }}>
        {reviewsDue.length === 0 && <Empty text="No review dates set yet." />}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {reviewsDue.map((r) => (
            <div
              key={r.id}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "baseline",
                padding: "9px 0",
                borderTop: `1px solid ${C.line}`,
                flexWrap: "wrap",
              }}
            >
              <Link
                to={`/clients/${r.id}`}
                style={{ fontWeight: 700, fontSize: 13.5, color: C.primary, textDecoration: "none", minWidth: 170 }}
              >
                {r.first_names} {r.surname}
              </Link>
              <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.inkSoft, flex: 1 }}>
                {r.next_review_type ?? "Review"} · {fmtDate(r.next_review_date)} · {r.review_cycle} cycle ·{" "}
                {r.adviser_name}
              </span>
              {reviewPill(r.days_until)}
            </div>
          ))}
        </div>
        {stats.reviewsNoDateSet > 0 && (
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.line}`, fontSize: 12.5, color: C.amber }}>
            {stats.reviewsNoDateSet} client{stats.reviewsNoDateSet > 1 ? "s have" : " has"} no next review date set.
          </div>
        )}
      </Card>

      <SectionTitle>Case pipeline</SectionTitle>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 10,
          marginBottom: 28,
        }}
      >
        {pipeline.map(({ stage, count, cases }) => (
          <Card key={stage} style={{ padding: 12, opacity: count ? 1 : 0.6 }}>
            <div
              style={{
                fontFamily: C.mono,
                fontSize: 10,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: stage === "Completed" ? C.mauve : C.primary,
                marginBottom: 8,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>{stage}</span>
              <span>{count}</span>
            </div>
            {count === 0 && <Empty text="—" />}
            {cases.map((k) => (
              <div key={k.id} style={{ borderTop: `1px solid ${C.line}`, paddingTop: 8, marginTop: 8 }}>
                <Link
                  to={`/clients/${k.client_id}`}
                  style={{ fontWeight: 700, fontSize: 12.5, color: C.primary, textDecoration: "none" }}
                >
                  {k.client_first_names} {k.client_surname}
                </Link>
                <div style={{ fontSize: 12.5, margin: "2px 0 6px", lineHeight: 1.45 }}>{k.title}</div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                  {k.waiting_on && <Pill tone="plain">with {k.waiting_on}</Pill>}
                  {stage !== "Completed" && k.idle_days > 14 && (
                    <Pill tone="red">stalled {k.idle_days}d</Pill>
                  )}
                </div>
              </div>
            ))}
          </Card>
        ))}
      </div>

      <SectionTitle>Team workload</SectionTitle>
      <Card>
        {workload.length === 0 && <Empty text="No active staff." />}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {workload.map((w) => (
            <div
              key={w.id}
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                padding: "10px 0",
                borderTop: `1px solid ${C.line}`,
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 13.5, minWidth: 100 }}>{w.name}</span>
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
              <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.inkSoft }}>
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

function SectionTitle({ children }: { children: string }) {
  return <div style={{ fontWeight: 700, fontSize: 16, margin: "0 0 10px" }}>{children}</div>;
}

function Empty({ text }: { text: string }) {
  return <div style={{ fontSize: 12.5, color: C.inkSoft, fontStyle: "italic" }}>{text}</div>;
}
