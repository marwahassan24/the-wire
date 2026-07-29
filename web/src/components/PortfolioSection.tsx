import { useState, type FormEvent } from "react";
import { theme as C } from "../theme.js";
import { api, ApiError } from "../api.js";
import { fmtDate, splitIntoBulletLines } from "../format.js";
import type { Portfolio, PortfolioLogEntry } from "../types.js";
import { AssetAllocation } from "./AssetAllocation.js";
import { Btn, CollapsibleSection, Input, Textarea } from "./ui.js";

export function PortfolioSection({
  clientId,
  portfolio,
  onChange,
  open,
  onToggle,
}: {
  clientId: number;
  portfolio: Portfolio;
  onChange: (portfolio: Portfolio) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const hasSummary = portfolio.summary.trim().length > 0;
  const summary =
    !hasSummary && portfolio.logs.length === 0
      ? "- empty"
      : hasSummary && portfolio.updated_at
        ? `- updated ${fmtDate(portfolio.updated_at)}`
        : `- ${portfolio.logs.length} log ${portfolio.logs.length === 1 ? "entry" : "entries"}`;
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState(portfolio.summary);
  const [savingSummary, setSavingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [logDate, setLogDate] = useState("");
  const [logText, setLogText] = useState("");
  const [addingLog, setAddingLog] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);

  const summaryLines = splitIntoBulletLines(portfolio.summary);

  async function saveSummary() {
    setSavingSummary(true);
    setSummaryError(null);
    try {
      const updated = await api.put<{ client_id: number; summary: string; updated_by: number | null; updated_at: string }>(
        `/api/clients/${clientId}/portfolio`,
        { summary: summaryDraft }
      );
      onChange({ ...portfolio, summary: updated.summary, updated_by: updated.updated_by, updated_at: updated.updated_at });
      setEditingSummary(false);
    } catch (err) {
      setSummaryError(err instanceof ApiError ? err.message : "Couldn't save that.");
    } finally {
      setSavingSummary(false);
    }
  }

  async function addLog(e: FormEvent) {
    e.preventDefault();
    if (!logText.trim()) return;
    setAddingLog(true);
    setLogError(null);
    try {
      const created = await api.post<PortfolioLogEntry>(`/api/clients/${clientId}/portfolio-log`, {
        text: logText.trim(),
        ...(logDate ? { entry_date: logDate } : {}),
      });
      onChange({
        ...portfolio,
        logs: [created, ...portfolio.logs].sort((a, b) =>
          a.entry_date < b.entry_date ? 1 : a.entry_date > b.entry_date ? -1 : 0
        ),
      });
      setLogText("");
      setLogDate("");
    } catch {
      setLogError("Couldn't add that log entry.");
    } finally {
      setAddingLog(false);
    }
  }

  return (
    <CollapsibleSection id="portfolio" title="4. Portfolio detail" summary={summary} open={open} onToggle={onToggle}>
      <AssetAllocation holdings={portfolio.holdings} />

      {!editingSummary && (
        <div>
          <div style={{ marginBottom: 10 }}>
            {summaryLines.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: C.text.body, lineHeight: 1.6, color: C.ink }}>
                {summaryLines.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            ) : (
              <span style={{ fontSize: C.text.small, color: C.inkSoft }}>Nothing here yet.</span>
            )}
          </div>
          <Btn
            tone="ghost"
            small
            onClick={() => {
              setSummaryDraft(portfolio.summary);
              setEditingSummary(true);
            }}
          >
            Edit summary
          </Btn>
        </div>
      )}
      {editingSummary && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Textarea value={summaryDraft} onChange={(e) => setSummaryDraft(e.target.value)} autoFocus />
          <div style={{ display: "flex", gap: 8 }}>
            <Btn tone="ink" small disabled={savingSummary} onClick={saveSummary}>
              Save
            </Btn>
            <Btn
              tone="ghost"
              small
              onClick={() => {
                setEditingSummary(false);
                setSummaryError(null);
              }}
            >
              Cancel
            </Btn>
          </div>
          {summaryError && <div style={{ fontSize: C.text.small, color: C.red }}>{summaryError}</div>}
        </div>
      )}

      {portfolio.logs.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
          {portfolio.logs.map((l) => (
            <div key={l.id} style={{ fontSize: C.text.small, display: "flex", gap: 12 }}>
              <span style={{ color: C.inkSoft, flexShrink: 0 }}>{fmtDate(l.entry_date)}</span>
              <span style={{ color: C.ink }}>{l.text}</span>
            </div>
          ))}
        </div>
      )}

      <form
        onSubmit={addLog}
        style={{ display: "flex", gap: 10, marginTop: 20, paddingTop: 20, borderTop: `1px solid ${C.line}` }}
      >
        <Input
          type="date"
          value={logDate}
          onChange={(e) => setLogDate(e.target.value)}
          style={{ maxWidth: 170, flexShrink: 0 }}
        />
        <Input placeholder="Add a portfolio log entry…" value={logText} onChange={(e) => setLogText(e.target.value)} />
        <Btn type="submit" tone="ink" disabled={addingLog || !logText.trim()}>
          Add
        </Btn>
      </form>
      {logError && <div style={{ fontSize: C.text.small, color: C.red, marginTop: 8 }}>{logError}</div>}
    </CollapsibleSection>
  );
}
