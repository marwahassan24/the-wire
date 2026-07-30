import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { theme as C } from "../theme.js";
import { api } from "../api.js";
import { fmtDate } from "../format.js";
import type { OpsCase, OpsDashboard, OpsOutstandingItem } from "../types.js";
import { Btn, Card, Input, Pill, SectionHeading } from "../components/ui.js";
import { OUTSTANDING_TYPE_LABEL } from "../components/OutstandingItemsSection.js";

const DEFAULT_QUIET_DAYS = 90;
const DEFAULT_STALLED_DAYS = 14;
const DEFAULT_LOA_DAYS = 21;
const DEFAULT_SIGNATURE_DAYS = 14;
const DEFAULT_TRANSFER_DAYS = 45;

// A threshold that's editable via a debounced number input - typing a new
// value doesn't re-fetch on every keystroke, same pattern reused for every
// configurable SLA window on this page (quiet/stalled/per-type).
function useDebouncedDays(defaultValue: number): [number, string, (v: string) => void] {
  const [days, setDays] = useState(defaultValue);
  const [input, setInput] = useState(String(defaultValue));

  useEffect(() => {
    const parsed = Number(input);
    if (!Number.isFinite(parsed) || parsed < 1) return;
    const handle = setTimeout(() => setDays(Math.round(parsed)), 400);
    return () => clearTimeout(handle);
  }, [input]);

  return [days, input, setInput];
}

// title= gives a native hover tooltip - no extra library, works everywhere,
// and doesn't need its own open/close state. These tiles are terse by
// design (a number and two words), so the explanation of what's actually
// being counted has to live somewhere - this is that somewhere.
function Stat({ n, label, hint, tone }: { n: number; label: string; hint: string; tone?: string }) {
  return (
    <Card style={{ padding: "20px 16px", textAlign: "center", cursor: "default" }} title={hint}>
      <div style={{ fontSize: 28, fontWeight: 800, color: tone ?? C.primary, lineHeight: 1.1 }}>{n}</div>
      <div style={{ fontSize: C.text.small, color: C.inkSoft, marginTop: 8 }}>{label}</div>
    </Card>
  );
}

function ThresholdInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: C.text.small, color: C.inkSoft }}>
      {label}
      <Input
        type="number"
        min={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: 64, padding: "6px 8px" }}
      />
      days
    </label>
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
  const [quietDays, quietDaysInput, setQuietDaysInput] = useDebouncedDays(DEFAULT_QUIET_DAYS);
  const [stalledDays, stalledDaysInput, setStalledDaysInput] = useDebouncedDays(DEFAULT_STALLED_DAYS);
  const [loaDays, loaDaysInput, setLoaDaysInput] = useDebouncedDays(DEFAULT_LOA_DAYS);
  const [signatureDays, signatureDaysInput, setSignatureDaysInput] = useDebouncedDays(DEFAULT_SIGNATURE_DAYS);
  const [transferDays, transferDaysInput, setTransferDaysInput] = useDebouncedDays(DEFAULT_TRANSFER_DAYS);

  function loadDashboard() {
    const params = new URLSearchParams({
      quiet_days: String(quietDays),
      stalled_days: String(stalledDays),
      loa_days: String(loaDays),
      signature_days: String(signatureDays),
      transfer_days: String(transferDays),
    });
    return api
      .get<OpsDashboard>(`/api/ops/dashboard?${params}`)
      .then(setDashboard)
      .catch(() => setError("Couldn't load the operations dashboard."));
  }

  useEffect(() => {
    loadDashboard();
  }, [quietDays, stalledDays, loaDays, signatureDays, transferDays]);

  if (error) return <div style={{ color: C.red, fontSize: C.text.small }}>{error}</div>;
  if (!dashboard) return <div style={{ color: C.inkSoft, fontSize: C.text.small }}>Loading…</div>;

  const { stats, reviewsDue, pipeline, workload, goingQuiet, outstandingItems } = dashboard;

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
        <Stat
          n={stats.reviewsOverdue}
          label="Reviews overdue"
          hint="Clients whose next review date has already passed."
          tone={stats.reviewsOverdue ? C.red : undefined}
        />
        <Stat
          n={stats.reviewsDueSoon}
          label="Reviews next 6 weeks"
          hint="Clients whose next review falls within the next 6 weeks."
        />
        <Stat
          n={stats.reviewsNoDateSet}
          label="No review date"
          hint="Clients with no next review date set at all - nothing to chase because nothing's scheduled."
          tone={stats.reviewsNoDateSet ? C.amber : undefined}
        />
        <Stat
          n={stats.liveCases}
          label="Live cases"
          hint="Cases still open - anything not yet at the Completed stage."
        />
        <Stat
          n={stats.withProvider}
          label="With provider"
          hint="Open cases currently marked as waiting on a product provider."
          tone={C.mauve}
        />
        <Stat
          n={stats.withClient}
          label="With client"
          hint="Open cases currently marked as waiting on the client."
          tone={C.mauve}
        />
        <Stat
          n={stats.stalledCases}
          label={`Stalled ${stalledDays}d+`}
          hint={`Open cases that haven't changed stage in ${stalledDays} or more days - adjust the "Stalled at" threshold below.`}
          tone={stats.stalledCases ? C.red : undefined}
        />
        <Stat
          n={outstandingItems.stats.loa}
          label="LOAs outstanding"
          hint="Letters of Authority requested but not yet returned, across all clients."
          tone={outstandingItems.stats.loa ? C.amber : undefined}
        />
        <Stat
          n={outstandingItems.stats.signature}
          label="Signatures outstanding"
          hint="Client signatures requested but not yet returned, across all clients."
          tone={outstandingItems.stats.signature ? C.amber : undefined}
        />
        <Stat
          n={outstandingItems.stats.transfer}
          label="Transfers outstanding"
          hint="Asset/plan transfers still in progress that haven't completed yet, across all clients."
          tone={outstandingItems.stats.transfer ? C.amber : undefined}
        />
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

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <SectionHeading>Going quiet</SectionHeading>
        <ThresholdInput label="No contact in" value={quietDaysInput} onChange={setQuietDaysInput} />
      </div>
      <Card style={{ marginBottom: 36 }}>
        {goingQuiet.length === 0 && (
          <Empty text={`Nobody's gone quiet - everyone's been contacted within ${quietDays} days.`} />
        )}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {goingQuiet.map((g) => (
            <div
              key={g.id}
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
                to={`/clients/${g.id}`}
                style={{ fontWeight: 600, fontSize: C.text.body, color: C.primary, textDecoration: "none", minWidth: 180 }}
              >
                {g.first_names} {g.surname}
              </Link>
              <span style={{ fontSize: C.text.small, color: C.inkSoft, flex: 1 }}>{g.adviser_name}</span>
              {g.last_contact_date ? (
                <Pill tone="amber">
                  last contact {fmtDate(g.last_contact_date)} · {g.days_since_contact}d silent
                </Pill>
              ) : (
                <Pill tone="red">never contacted</Pill>
              )}
            </div>
          ))}
        </div>
      </Card>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <SectionHeading>Outstanding items</SectionHeading>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <ThresholdInput label="LOA" value={loaDaysInput} onChange={setLoaDaysInput} />
          <ThresholdInput label="Signature" value={signatureDaysInput} onChange={setSignatureDaysInput} />
          <ThresholdInput label="Transfer" value={transferDaysInput} onChange={setTransferDaysInput} />
        </div>
      </div>
      <Card style={{ marginBottom: 36 }}>
        {outstandingItems.items.length === 0 && <Empty text="Nothing outstanding." />}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {outstandingItems.items.map((item) => (
            <OutstandingItemRow key={item.id} item={item} />
          ))}
        </div>
      </Card>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <SectionHeading>Case pipeline</SectionHeading>
        <ThresholdInput label="Stalled at" value={stalledDaysInput} onChange={setStalledDaysInput} />
      </div>
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

function OutstandingItemRow({ item }: { item: OpsOutstandingItem }) {
  return (
    <div
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
        to={`/clients/${item.client_id}`}
        style={{ fontWeight: 600, fontSize: C.text.body, color: C.primary, textDecoration: "none", minWidth: 180 }}
      >
        {item.client_first_names} {item.client_surname}
      </Link>
      <span style={{ fontSize: C.text.small, color: C.inkSoft, flex: 1 }}>
        <Pill tone="plain">{OUTSTANDING_TYPE_LABEL[item.type]}</Pill> {item.description} · {item.owner_name} · raised{" "}
        {fmtDate(item.raised_at)}
      </span>
      {item.flagged ? (
        <Pill tone="red">{item.days_outstanding}d outstanding</Pill>
      ) : (
        <Pill tone="plain">{item.days_outstanding}d outstanding</Pill>
      )}
    </div>
  );
}

function CaseCard({
  kase,
  nextStage,
  onAdvanced,
}: {
  kase: OpsCase;
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
        {kase.stalled && <Pill tone="red">stalled {kase.idle_days}d</Pill>}
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
