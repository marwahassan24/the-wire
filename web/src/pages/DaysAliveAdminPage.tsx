import { useEffect, useState, type FormEvent } from "react";
import { theme as C } from "../theme.js";
import { api, ApiError } from "../api.js";
import { fmtDate } from "../format.js";
import type {
  DaysAliveAlert,
  DaysAliveDiagnosis,
  DaysAliveMilestone,
  DaysAlivePreview,
  DaysAliveRunResult,
  DaysAliveSettings,
} from "../types.js";
import { Btn, Card, Input, Pill, SectionHeading, Select } from "../components/ui.js";

const STATUS_TONE = { pending: "amber", sent: "primary", failed: "red", skipped: "plain" } as const;

export function DaysAliveAdminPage() {
  const [settings, setSettings] = useState<DaysAliveSettings | null>(null);
  const [milestones, setMilestones] = useState<DaysAliveMilestone[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function loadAll() {
    setError(null);
    return Promise.all([
      api.get<DaysAliveSettings>("/api/days-alive/settings").then(setSettings),
      api.get<DaysAliveMilestone[]>("/api/days-alive/milestones").then(setMilestones),
    ]).catch(() => setError("Couldn't load Days on the Planet settings."));
  }

  useEffect(() => {
    loadAll();
  }, []);

  if (error) return <div style={{ color: C.red, fontSize: C.text.small }}>{error}</div>;
  if (!settings || !milestones) return <div style={{ color: C.inkSoft, fontSize: C.text.small }}>Loading…</div>;

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: C.text.title, marginBottom: 8 }}>Days on the Planet</div>
      <div style={{ fontSize: C.text.small, color: C.inkSoft, marginBottom: 28 }}>
        Milestone-day alerts, calculated directly from each client's date of birth - nothing here is cached or
        precomputed.
      </div>

      <SectionHeading>Settings</SectionHeading>
      <Card style={{ marginBottom: 36 }}>
        <SettingsForm settings={settings} onSaved={setSettings} />
      </Card>

      <SectionHeading>Milestones</SectionHeading>
      <Card style={{ marginBottom: 36 }}>
        <MilestonesEditor
          milestones={milestones}
          onChange={setMilestones}
        />
      </Card>

      <SectionHeading>Upcoming alerts</SectionHeading>
      <Card style={{ marginBottom: 36 }}>
        <UpcomingPreview />
      </Card>

      <SectionHeading>Manual run / rerun a date</SectionHeading>
      <Card style={{ marginBottom: 36 }}>
        <ManualRun />
      </Card>

      <SectionHeading>Diagnose a specific client + milestone</SectionHeading>
      <Card style={{ marginBottom: 36 }}>
        <Diagnose />
      </Card>

      <SectionHeading>Alert history</SectionHeading>
      <Card>
        <AlertHistory />
      </Card>
    </div>
  );
}

function SettingsForm({
  settings,
  onSaved,
}: {
  settings: DaysAliveSettings;
  onSaved: (s: DaysAliveSettings) => void;
}) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [warningDaysBefore, setWarningDaysBefore] = useState(String(settings.warningDaysBefore));
  const [cardLeadDays, setCardLeadDays] = useState(String(settings.cardLeadDays));
  const [recipientEmail, setRecipientEmail] = useState(settings.recipientEmail ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await api.patch<DaysAliveSettings>("/api/days-alive/settings", {
        enabled,
        warning_days_before: Number(warningDaysBefore),
        card_lead_days: Number(cardLeadDays),
        recipient_email: recipientEmail.trim() || null,
      });
      onSaved(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save settings.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: C.text.body, color: C.ink }}>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Feature enabled - the daily job only sends alerts while this is on
      </label>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: C.text.small, color: C.inkSoft }}>
          Warning period (days before milestone)
          <Input
            type="number"
            min={1}
            value={warningDaysBefore}
            onChange={(e) => setWarningDaysBefore(e.target.value)}
            style={{ width: 140 }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: C.text.small, color: C.inkSoft }}>
          Send card by (days before milestone)
          <Input
            type="number"
            min={0}
            value={cardLeadDays}
            onChange={(e) => setCardLeadDays(e.target.value)}
            style={{ width: 140 }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: C.text.small, color: C.inkSoft }}>
          Recipient email
          <Input
            type="email"
            placeholder="cards@tcfp.test"
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
            style={{ width: 260 }}
          />
        </label>
      </div>
      <div style={{ fontSize: C.text.small, color: C.inkSoft }}>
        This is who receives the milestone-alert emails - the client is never emailed directly. If left blank, the
        job falls back to the DAYS_ALIVE_RECIPIENT environment variable; if neither is set, alerts are recorded as
        failed with a clear reason rather than silently not sending.
      </div>
      <div>
        <Btn type="submit" tone="ink" small disabled={submitting}>
          Save settings
        </Btn>
      </div>
      {saved && <div style={{ fontSize: C.text.small, color: C.ink }}>Saved.</div>}
      {error && <div style={{ fontSize: C.text.small, color: C.red }}>{error}</div>}
    </form>
  );
}

function MilestonesEditor({
  milestones,
  onChange,
}: {
  milestones: DaysAliveMilestone[];
  onChange: (m: DaysAliveMilestone[]) => void;
}) {
  const [newDays, setNewDays] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function toggle(m: DaysAliveMilestone) {
    setBusyId(m.id);
    setError(null);
    try {
      const updated = await api.patch<DaysAliveMilestone>(`/api/days-alive/milestones/${m.id}`, {
        enabled: !m.enabled,
      });
      onChange(milestones.map((x) => (x.id === m.id ? updated : x)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't update that milestone.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(m: DaysAliveMilestone) {
    if (!window.confirm(`Remove the ${m.days.toLocaleString("en-GB")}-day milestone? This can't be undone.`)) return;
    setBusyId(m.id);
    setError(null);
    try {
      await api.delete(`/api/days-alive/milestones/${m.id}`);
      onChange(milestones.filter((x) => x.id !== m.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't remove that milestone.");
    } finally {
      setBusyId(null);
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const days = Number(newDays);
    if (!Number.isInteger(days) || days < 1) return;
    setError(null);
    try {
      const created = await api.post<DaysAliveMilestone>("/api/days-alive/milestones", { days });
      onChange([...milestones, created].sort((a, b) => a.days - b.days));
      setNewDays("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't add that milestone.");
    }
  }

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        {milestones.map((m) => (
          <div
            key={m.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 4px 4px 11px",
              borderRadius: 20,
              background: m.enabled ? C.primarySoft : C.paper,
              opacity: m.enabled ? 1 : 0.6,
            }}
          >
            <button
              type="button"
              onClick={() => toggle(m)}
              disabled={busyId === m.id}
              title={m.enabled ? "Click to disable" : "Click to enable"}
              style={{
                all: "unset",
                cursor: "pointer",
                fontSize: C.text.small,
                color: m.enabled ? C.primary : C.inkSoft,
                fontWeight: 600,
              }}
            >
              {m.days.toLocaleString("en-GB")}
            </button>
            <button
              type="button"
              onClick={() => remove(m)}
              disabled={busyId === m.id}
              aria-label={`Remove milestone ${m.days}`}
              style={{
                all: "unset",
                cursor: "pointer",
                color: C.inkSoft,
                fontSize: 12,
                padding: "0 4px",
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <form onSubmit={add} style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Input
          type="number"
          min={1}
          placeholder="Add a milestone (days)"
          value={newDays}
          onChange={(e) => setNewDays(e.target.value)}
          style={{ width: 200 }}
        />
        <Btn type="submit" tone="ghost" small disabled={!newDays}>
          Add
        </Btn>
      </form>
      <div style={{ fontSize: C.text.small, color: C.inkSoft, marginTop: 10 }}>
        Click a milestone to enable/disable it; ✕ removes it entirely.
      </div>
      {error && <div style={{ fontSize: C.text.small, color: C.red, marginTop: 8 }}>{error}</div>}
    </div>
  );
}

function UpcomingPreview() {
  const [days, setDays] = useState<30 | 60 | 90>(30);
  const [result, setResult] = useState<DaysAlivePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(chosen: 30 | 60 | 90) {
    setDays(chosen);
    setLoading(true);
    setError(null);
    try {
      setResult(await api.get<DaysAlivePreview>(`/api/days-alive/preview?days=${chosen}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load the preview.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    run(30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {([30, 60, 90] as const).map((d) => (
          <Btn key={d} tone={days === d ? "ink" : "ghost"} small onClick={() => run(d)} disabled={loading}>
            Next {d} days
          </Btn>
        ))}
      </div>
      {error && <div style={{ fontSize: C.text.small, color: C.red }}>{error}</div>}
      {result && result.matches.length === 0 && (
        <div style={{ fontSize: C.text.small, color: C.inkSoft }}>Nothing due in this window.</div>
      )}
      {result && result.matches.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {result.matches.map((m) => (
            <div key={`${m.clientId}-${m.milestoneDays}`} style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: C.text.small }}>
              <span style={{ fontWeight: 600, color: C.ink, minWidth: 160 }}>{m.fullName}</span>
              <span style={{ color: C.inkSoft }}>
                {m.milestoneDays.toLocaleString("en-GB")} days · {fmtDate(m.milestoneDate)} · age {m.ageOnMilestone} ·
                alert {fmtDate(m.alertDate)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ManualRun() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [result, setResult] = useState<DaysAliveRunResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.post<DaysAliveRunResult>("/api/days-alive/run", { date }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't run the check.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: C.text.small, color: C.inkSoft }}>
        Runs the real check for the chosen date - if it's already been run for that date, matching alerts are
        reported as skipped, not sent again.
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 170 }} />
        <Btn type="submit" tone="ink" small disabled={submitting}>
          {submitting ? "Running…" : "Run for this date"}
        </Btn>
      </div>
      {error && <div style={{ fontSize: C.text.small, color: C.red }}>{error}</div>}
      {result && (
        <div style={{ fontSize: C.text.small, color: C.ink }}>
          {result.featureEnabled ? (
            <>
              {result.clientsChecked} clients checked ({result.clientsSkippedNoDob} skipped - no DoB) ·{" "}
              <span style={{ color: C.primary }}>{result.alertsSent} sent</span> ·{" "}
              <span style={{ color: C.inkSoft }}>{result.alertsSkipped} already sent (skipped)</span> ·{" "}
              <span style={{ color: C.red }}>{result.alertsFailed} failed</span>
            </>
          ) : (
            "The feature is currently disabled in settings - nothing was checked."
          )}
        </div>
      )}
    </form>
  );
}

function Diagnose() {
  const [clientId, setClientId] = useState("");
  const [milestoneDays, setMilestoneDays] = useState("");
  const [evaluationDate, setEvaluationDate] = useState("");
  const [result, setResult] = useState<DaysAliveDiagnosis | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!clientId || !milestoneDays) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const params = new URLSearchParams({ client_id: clientId, milestone_days: milestoneDays });
      if (evaluationDate) params.set("evaluation_date", evaluationDate);
      setResult(await api.get<DaysAliveDiagnosis>(`/api/days-alive/diagnose?${params}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't run the diagnosis.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: C.text.small, color: C.inkSoft }}>
        "Should this client have received an alert for this milestone?" - answered fresh from their date of birth
        and cross-checked against the alert history, not read off anything cached.
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <Input
          type="number"
          placeholder="Client ID"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          style={{ width: 140 }}
        />
        <Input
          type="number"
          placeholder="Milestone (days)"
          value={milestoneDays}
          onChange={(e) => setMilestoneDays(e.target.value)}
          style={{ width: 160 }}
        />
        <Input
          type="date"
          value={evaluationDate}
          onChange={(e) => setEvaluationDate(e.target.value)}
          style={{ width: 170 }}
          title="Evaluate as of this date (optional, defaults to today)"
        />
        <Btn type="submit" tone="ink" small disabled={submitting || !clientId || !milestoneDays}>
          Diagnose
        </Btn>
      </div>
      {error && <div style={{ fontSize: C.text.small, color: C.red }}>{error}</div>}
      {result && (
        <div style={{ fontSize: C.text.small, color: C.ink, display: "flex", flexDirection: "column", gap: 4 }}>
          <div>Date of birth: {result.dateOfBirth ? fmtDate(result.dateOfBirth) : "not on file"}</div>
          <div>Milestone date: {result.milestoneDate ? fmtDate(result.milestoneDate) : "-"}</div>
          <div>Alert date: {result.alertDate ? fmtDate(result.alertDate) : "-"}</div>
          <div>Days alive on evaluation date: {result.daysAliveOnEvaluationDate ?? "-"}</div>
          <div>Milestone enabled: {result.milestoneEnabled === null ? "milestone doesn't exist" : result.milestoneEnabled ? "yes" : "no"}</div>
          <div>Alert record exists: {result.alertRecordExists ? "yes" : "no"}</div>
          <div>Email sent: {result.emailSent ? "yes" : "no"}</div>
          {result.failureReason && <div style={{ color: C.red }}>Failure reason: {result.failureReason}</div>}
        </div>
      )}
    </form>
  );
}

function AlertHistory() {
  const [clientId, setClientId] = useState("");
  const [status, setStatus] = useState("");
  const [milestoneDays, setMilestoneDays] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [alerts, setAlerts] = useState<DaysAliveAlert[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setError(null);
    const params = new URLSearchParams();
    if (clientId) params.set("client_id", clientId);
    if (status) params.set("status", status);
    if (milestoneDays) params.set("milestone_days", milestoneDays);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    api
      .get<DaysAliveAlert[]>(`/api/days-alive/alerts?${params}`)
      .then(setAlerts)
      .catch(() => setError("Couldn't load alert history."));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        <Input
          type="number"
          placeholder="Client ID"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          style={{ width: 120 }}
        />
        <Select value={status} onChange={setStatus} placeholder="Any status">
          <option value="pending">pending</option>
          <option value="sent">sent</option>
          <option value="failed">failed</option>
          <option value="skipped">skipped</option>
        </Select>
        <Input
          type="number"
          placeholder="Milestone (days)"
          value={milestoneDays}
          onChange={(e) => setMilestoneDays(e.target.value)}
          style={{ width: 150 }}
        />
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 170 }} />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 170 }} />
        <Btn tone="ghost" small onClick={load}>
          Filter
        </Btn>
      </div>
      {error && <div style={{ fontSize: C.text.small, color: C.red }}>{error}</div>}
      {alerts && alerts.length === 0 && <div style={{ fontSize: C.text.small, color: C.inkSoft }}>No alerts match.</div>}
      {alerts && alerts.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {alerts.map((a) => (
            <div
              key={a.id}
              style={{
                display: "flex",
                gap: 12,
                alignItems: "baseline",
                padding: "12px 0",
                borderTop: `1px solid ${C.line}`,
                flexWrap: "wrap",
              }}
            >
              <Pill tone={STATUS_TONE[a.status]}>{a.status}</Pill>
              <span style={{ fontWeight: 600, fontSize: C.text.small, color: C.ink, minWidth: 160 }}>
                {a.client_first_names} {a.client_surname}
              </span>
              <span style={{ fontSize: C.text.small, color: C.inkSoft }}>
                {a.milestone_days.toLocaleString("en-GB")} days · milestone {fmtDate(a.milestone_date)} · alert{" "}
                {fmtDate(a.alert_date)} · age {a.age_years_on_milestone}
              </span>
              {a.error_message && <span style={{ fontSize: C.text.small, color: C.red }}>{a.error_message}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
