import { useState, type FormEvent } from "react";
import { theme as C } from "../theme.js";
import { api, ApiError } from "../api.js";
import { fmtDate } from "../format.js";
import type { SoftFact } from "../types.js";
import { Btn, Card, Input, SectionHeading } from "./ui.js";

export function SoftFactsSection({
  clientId,
  softFacts,
  onChange,
}: {
  clientId: number;
  softFacts: SoftFact[];
  onChange: (softFacts: SoftFact[]) => void;
}) {
  const [newDate, setNewDate] = useState("");
  const [newText, setNewText] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!newText.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const created = await api.post<SoftFact>(`/api/clients/${clientId}/soft-facts`, {
        text: newText.trim(),
        ...(newDate ? { fact_date: newDate } : {}),
      });
      onChange(
        [created, ...softFacts].sort((a, b) => (a.fact_date < b.fact_date ? 1 : a.fact_date > b.fact_date ? -1 : 0))
      );
      setNewText("");
      setNewDate("");
    } catch {
      setError("Couldn't add that soft fact.");
    } finally {
      setAdding(false);
    }
  }

  function handleUpdated(updated: SoftFact) {
    onChange(softFacts.map((f) => (f.id === updated.id ? updated : f)));
  }

  function handleDeleted(id: number) {
    onChange(softFacts.filter((f) => f.id !== id));
  }

  return (
    <Card>
      <SectionHeading>1. Soft facts</SectionHeading>
      {softFacts.length === 0 && (
        <div style={{ fontSize: C.text.small, color: C.inkSoft, marginBottom: 16 }}>Nothing here yet.</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {softFacts.map((f) => (
          <SoftFactRow key={f.id} fact={f} onUpdated={handleUpdated} onDeleted={handleDeleted} />
        ))}
      </div>

      <form
        onSubmit={handleAdd}
        style={{ display: "flex", gap: 10, marginTop: 24, paddingTop: 24, borderTop: `1px solid ${C.line}` }}
      >
        <Input
          type="date"
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
          style={{ maxWidth: 170, flexShrink: 0 }}
        />
        <Input placeholder="Add a soft fact…" value={newText} onChange={(e) => setNewText(e.target.value)} />
        <Btn type="submit" tone="ink" disabled={adding || !newText.trim()}>
          Add
        </Btn>
      </form>
      {error && <div style={{ fontSize: C.text.small, color: C.red, marginTop: 8 }}>{error}</div>}
    </Card>
  );
}

function SoftFactRow({
  fact,
  onUpdated,
  onDeleted,
}: {
  fact: SoftFact;
  onUpdated: (f: SoftFact) => void;
  onDeleted: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(fact.text);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!text.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await api.patch<SoftFact>(`/api/soft-facts/${fact.id}`, { text: text.trim() });
      onUpdated(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save that.");
    } finally {
      setSubmitting(false);
    }
  }

  async function remove() {
    if (!window.confirm("Remove this soft fact? It stays on record, just hidden.")) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.delete(`/api/soft-facts/${fact.id}`);
      onDeleted(fact.id);
    } catch {
      setError("Couldn't remove that.");
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        {/* fact_date is not editable here - it's the date the thing happened,
            not the date it was written down, same rule the API enforces. */}
        <span style={{ fontSize: C.text.small, color: C.inkSoft }}>{fmtDate(fact.fact_date)}</span>
        {!editing && (
          <div style={{ display: "flex", gap: 8 }}>
            <Btn tone="ghost" small disabled={submitting} onClick={() => setEditing(true)}>
              Edit
            </Btn>
            <Btn tone="ghost" small disabled={submitting} onClick={remove}>
              Remove
            </Btn>
          </div>
        )}
      </div>
      {!editing && <div style={{ fontSize: C.text.body, lineHeight: 1.6 }}>{fact.text}</div>}
      {editing && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Input value={text} onChange={(e) => setText(e.target.value)} autoFocus />
          <div style={{ display: "flex", gap: 8 }}>
            <Btn tone="ink" small disabled={submitting || !text.trim()} onClick={save}>
              Save
            </Btn>
            <Btn
              tone="ghost"
              small
              onClick={() => {
                setEditing(false);
                setText(fact.text);
                setError(null);
              }}
            >
              Cancel
            </Btn>
          </div>
        </div>
      )}
      {error && <div style={{ fontSize: C.text.small, color: C.red, marginTop: 6 }}>{error}</div>}
    </div>
  );
}
