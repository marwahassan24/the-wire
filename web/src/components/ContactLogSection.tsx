import { useEffect, useState, type FormEvent } from "react";
import { theme as C } from "../theme.js";
import { api, ApiError } from "../api.js";
import { fmtDate } from "../format.js";
import type { ContactLog, StaffUser } from "../types.js";
import { Btn, CollapsibleSection, Input, Pill, Select } from "./ui.js";

export const CONTACT_TYPE_LABEL: Record<ContactLog["type"], string> = {
  call: "Call",
  email: "Email",
  meeting: "Meeting",
  other: "Other",
};

export function ContactLogSection({
  clientId,
  contactLog,
  onChange,
  open,
  onToggle,
}: {
  clientId: number;
  contactLog: ContactLog[];
  onChange: (contactLog: ContactLog[]) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const summary = contactLog.length === 0 ? "- none logged" : `- last contact ${fmtDate(contactLog[0].contact_date)}`;
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [newDate, setNewDate] = useState("");
  const [newType, setNewType] = useState<ContactLog["type"] | "">("call");
  const [newStaffId, setNewStaffId] = useState("");
  const [newNote, setNewNote] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<StaffUser[]>("/api/users")
      .then(setStaff)
      .catch(() => {});
  }, []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!newNote.trim() || !newStaffId || !newType) return;
    setAdding(true);
    setError(null);
    try {
      const created = await api.post<ContactLog>(`/api/clients/${clientId}/contact-log`, {
        type: newType,
        staff_id: Number(newStaffId),
        note: newNote.trim(),
        ...(newDate ? { contact_date: newDate } : {}),
      });
      onChange(
        [created, ...contactLog].sort((a, b) =>
          a.contact_date < b.contact_date ? 1 : a.contact_date > b.contact_date ? -1 : 0
        )
      );
      setNewDate("");
      setNewType("call");
      setNewStaffId("");
      setNewNote("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't add that.");
    } finally {
      setAdding(false);
    }
  }

  function handleDeleted(id: number) {
    onChange(contactLog.filter((c) => c.id !== id));
  }

  return (
    <CollapsibleSection id="contact-log" title="8. Contact log" summary={summary} open={open} onToggle={onToggle}>
      {contactLog.length === 0 && (
        <div style={{ fontSize: C.text.small, color: C.inkSoft, marginBottom: 16 }}>Nothing here yet.</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {contactLog.map((c) => (
          <ContactLogRow key={c.id} entry={c} onDeleted={handleDeleted} />
        ))}
      </div>

      <form
        onSubmit={handleAdd}
        style={{
          display: "flex",
          gap: 10,
          marginTop: 24,
          paddingTop: 24,
          borderTop: `1px solid ${C.line}`,
          flexWrap: "wrap",
        }}
      >
        <Input
          type="date"
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
          style={{ maxWidth: 160, flexShrink: 0 }}
        />
        <Select value={newType} onChange={(v) => setNewType(v as ContactLog["type"] | "")} placeholder="Type">
          <option value="call">Call</option>
          <option value="email">Email</option>
          <option value="meeting">Meeting</option>
          <option value="other">Other</option>
        </Select>
        <Select value={newStaffId} onChange={setNewStaffId} placeholder="Who from us">
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Input
          placeholder="Note…"
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          style={{ flex: "1 1 200px" }}
        />
        <Btn type="submit" tone="ink" disabled={adding || !newNote.trim() || !newStaffId || !newType}>
          Add
        </Btn>
      </form>
      {error && <div style={{ fontSize: C.text.small, color: C.red, marginTop: 8 }}>{error}</div>}
    </CollapsibleSection>
  );
}

function ContactLogRow({ entry, onDeleted }: { entry: ContactLog; onDeleted: (id: number) => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm("Remove this contact log entry? It stays on record, just hidden.")) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.delete(`/api/contact-log/${entry.id}`);
      onDeleted(entry.id);
    } catch {
      setError("Couldn't remove that.");
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: C.text.small, color: C.inkSoft }}>{fmtDate(entry.contact_date)}</span>
          <Pill tone="plain">{CONTACT_TYPE_LABEL[entry.type]}</Pill>
          <span style={{ fontSize: C.text.small, color: C.inkSoft }}>{entry.staff_name}</span>
        </div>
        <Btn tone="ghost" small disabled={submitting} onClick={remove}>
          Remove
        </Btn>
      </div>
      <div style={{ fontSize: C.text.body, lineHeight: 1.6 }}>{entry.note}</div>
      {error && <div style={{ fontSize: C.text.small, color: C.red, marginTop: 6 }}>{error}</div>}
    </div>
  );
}
