import { useState, type FormEvent } from "react";
import { theme as C } from "../theme.js";
import { api, ApiError } from "../api.js";
import { fmtDate } from "../format.js";
import type { MeetingNote } from "../types.js";
import { Btn, CollapsibleSection, Input, Pill, Select, Textarea } from "./ui.js";

const MEETING_TYPES = ["Annual", "Interim", "Ad hoc"] as const;

const TASK_STATUS_TONE = { awaiting_sense_check: "amber", confirmed: "primary", done: "plain" } as const;
const TASK_STATUS_LABEL: Record<string, string> = {
  awaiting_sense_check: "awaiting sense-check",
  confirmed: "confirmed",
  done: "done",
};

const ACTION_LINE_HINT = 'Lines starting "TCFP:" or "Client:" become draft tasks for a human to sense-check.';

// meeting_date comes back from the API as a full ISO timestamp
// (2026-02-10T00:00:00.000Z), not the plain YYYY-MM-DD an
// <input type="date"> requires.
const toDateInputValue = (iso: string) => iso.slice(0, 10);

export function MeetingNoteSection({
  clientId,
  meetingNotes,
  onChange,
  open,
  onToggle,
}: {
  clientId: number;
  meetingNotes: MeetingNote[];
  onChange: (meetingNotes: MeetingNote[]) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const latest = meetingNotes[0] ?? null;
  const summary = !latest
    ? "- empty"
    : latest.status === "draft"
      ? "- draft awaiting approval"
      : `- last ${fmtDate(latest.meeting_date)}`;

  function insertSorted(note: MeetingNote) {
    const rest = meetingNotes.filter((n) => n.id !== note.id);
    const combined = [note, ...rest].sort((a, b) => {
      if (a.meeting_date !== b.meeting_date) return a.meeting_date < b.meeting_date ? 1 : -1;
      return a.created_at < b.created_at ? 1 : -1;
    });
    onChange(combined);
  }

  const draftBlocksNew = !!latest && latest.status === "draft";
  const canStartNew = !creating && !draftBlocksNew;

  return (
    <CollapsibleSection
      id="meeting-note"
      title="3. Meeting note"
      summary={summary}
      open={open}
      onToggle={onToggle}
    >
      {!latest && !creating && <div style={{ fontSize: C.text.small, color: C.inkSoft }}>Nothing here yet.</div>}
      {/* key={latest.id} forces a fresh mount whenever the displayed note
          changes identity - without it, React reuses the instance and its
          useState-seeded date/type/body edit fields go stale, silently
          editing under the wrong values (caught by browser testing, not
          by the typechecker - the read-only view still reads note.body
          straight from props, so only the edit form was affected). */}
      {latest && <MeetingNoteView key={latest.id} note={latest} onUpdated={insertSorted} />}

      {/* Only one note is ever "latest" per client, so a second draft would
          have nowhere to live - approving the current one is what makes
          room. Without this line the "+ New meeting note" button simply
          vanished with no explanation, which is exactly what got reported
          as a bug: it's a deliberate constraint, but it wasn't visible. */}
      {draftBlocksNew && !creating && (
        <div style={{ fontSize: C.text.small, color: C.inkSoft, marginTop: 16 }}>
          You can't start another meeting note while one is still a draft. Approve the current draft above first.
        </div>
      )}

      {canStartNew && (
        <Btn tone="ghost" small onClick={() => setCreating(true)} style={{ marginTop: latest ? 16 : 0 }}>
          + New meeting note
        </Btn>
      )}
      {creating && (
        <NewNoteForm
          clientId={clientId}
          bordered={!!latest}
          onCreated={(note) => {
            insertSorted(note);
            setCreating(false);
          }}
          onCancel={() => setCreating(false)}
        />
      )}
    </CollapsibleSection>
  );
}

function MeetingNoteView({ note, onUpdated }: { note: MeetingNote; onUpdated: (n: MeetingNote) => void }) {
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(toDateInputValue(note.meeting_date));
  const [type, setType] = useState<string>(note.meeting_type);
  const [body, setBody] = useState(note.body);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!body.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await api.patch<MeetingNote>(`/api/meeting-notes/${note.id}`, {
        meeting_date: date,
        meeting_type: type,
        body: body.trim(),
      });
      onUpdated(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save that.");
    } finally {
      setSubmitting(false);
    }
  }

  async function approve() {
    if (
      !window.confirm(
        "Approve this meeting note? Once approved it becomes client-visible and can no longer be edited."
      )
    ) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const updated = await api.patch<MeetingNote>(`/api/meeting-notes/${note.id}`, { status: "approved" });
      onUpdated(updated);
    } catch {
      setError("Couldn't approve that.");
    } finally {
      setSubmitting(false);
    }
  }

  if (editing) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 10 }}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ maxWidth: 170 }} />
          <Select value={type} onChange={setType} placeholder="Type">
            {MEETING_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </div>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} autoFocus />
        <div style={{ fontSize: C.text.small, color: C.inkSoft }}>{ACTION_LINE_HINT}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn tone="ink" small disabled={submitting || !body.trim()} onClick={save}>
            Save
          </Btn>
          <Btn
            tone="ghost"
            small
            onClick={() => {
              setEditing(false);
              setDate(toDateInputValue(note.meeting_date));
              setType(note.meeting_type);
              setBody(note.body);
              setError(null);
            }}
          >
            Cancel
          </Btn>
        </div>
        {error && <div style={{ fontSize: C.text.small, color: C.red }}>{error}</div>}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: C.text.small, color: C.inkSoft }}>
          {note.meeting_type} · {fmtDate(note.meeting_date)}
        </span>
        <Pill tone={note.status === "approved" ? "primary" : "amber"}>{note.status}</Pill>
      </div>
      <div style={{ fontSize: C.text.body, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{note.body}</div>

      {note.tasks.length > 0 && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.line}` }}>
          <div style={{ fontSize: C.text.small, color: C.inkSoft, marginBottom: 8 }}>
            Draft tasks from this note
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {note.tasks.map((t) => (
              <div key={t.id} style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <Pill tone={TASK_STATUS_TONE[t.status]}>{TASK_STATUS_LABEL[t.status]}</Pill>
                <span style={{ fontSize: C.text.small, color: C.ink }}>{t.text}</span>
                <span style={{ fontSize: C.text.small, color: C.inkSoft }}>· {t.owner_name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {note.status === "draft" && (
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <Btn tone="ghost" small disabled={submitting} onClick={() => setEditing(true)}>
            Edit
          </Btn>
          <Btn tone="ink" small disabled={submitting} onClick={approve}>
            Approve
          </Btn>
        </div>
      )}
      {error && <div style={{ fontSize: C.text.small, color: C.red, marginTop: 8 }}>{error}</div>}
    </div>
  );
}

function NewNoteForm({
  clientId,
  bordered,
  onCreated,
  onCancel,
}: {
  clientId: number;
  bordered: boolean;
  onCreated: (note: MeetingNote) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [type, setType] = useState<string>("Interim");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.post<MeetingNote>(`/api/clients/${clientId}/meeting-notes`, {
        meeting_date: date,
        meeting_type: type,
        body: body.trim(),
      });
      onCreated(created);
    } catch {
      setError("Couldn't create that meeting note.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        marginTop: bordered ? 20 : 0,
        paddingTop: bordered ? 20 : 0,
        borderTop: bordered ? `1px solid ${C.line}` : undefined,
      }}
    >
      <div style={{ display: "flex", gap: 10 }}>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ maxWidth: 170 }} />
        <Select value={type} onChange={setType} placeholder="Type">
          {MEETING_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </div>
      <Textarea
        placeholder="Draft the meeting note…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        autoFocus
      />
      <div style={{ fontSize: C.text.small, color: C.inkSoft }}>{ACTION_LINE_HINT}</div>
      <div style={{ display: "flex", gap: 8 }}>
        <Btn type="submit" tone="ink" small disabled={submitting || !body.trim()}>
          Save draft
        </Btn>
        <Btn tone="ghost" small onClick={onCancel}>
          Cancel
        </Btn>
      </div>
      {error && <div style={{ fontSize: C.text.small, color: C.red }}>{error}</div>}
    </form>
  );
}
