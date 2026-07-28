import { useEffect, useState, type FormEvent } from "react";
import { theme as C } from "../theme.js";
import { api, ApiError } from "../api.js";
import { fmtDate } from "../format.js";
import type { StaffUser, Task } from "../types.js";
import { Btn, CollapsibleSection, Input, Pill, Select } from "./ui.js";

const STATUS_TONE = { awaiting_sense_check: "amber", confirmed: "primary", done: "plain" } as const;
const STATUS_LABEL: Record<Task["status"], string> = {
  awaiting_sense_check: "awaiting sense-check",
  confirmed: "confirmed",
  done: "done",
};

// GET /api/tasks has no client filter (owner/status/due only) - fetch
// everything and keep just this client's, same tradeoff as CasesSection.
export function TasksSection({
  clientId,
  open,
  onToggle,
  onTaskStatusChanged,
}: {
  clientId: number;
  open: boolean;
  onToggle: () => void;
  // A confirmed/done task might be one a meeting note created - the note's
  // own "Draft tasks from this note" list is a snapshot from when the
  // client last loaded, so it wouldn't otherwise learn the status changed.
  onTaskStatusChanged?: () => void;
}) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Task[]>("/api/tasks")
      .then((all) => setTasks(all.filter((t) => t.client_id === clientId)))
      .catch(() => setError("Couldn't load tasks."));
    api.get<StaffUser[]>("/api/users").then(setStaff).catch(() => {});
  }, [clientId]);

  function handleCreated(task: Task) {
    setTasks((prev) => (prev ? [...prev, task] : [task]));
  }
  function handleUpdated(updated: Task) {
    setTasks((prev) => prev?.map((t) => (t.id === updated.id ? updated : t)) ?? prev);
    onTaskStatusChanged?.();
  }

  const openCount = tasks?.filter((t) => t.status !== "done").length ?? 0;
  const summary = !tasks ? "" : tasks.length === 0 ? "(empty)" : openCount > 0 ? `(${openCount} open)` : "(all done)";

  return (
    <CollapsibleSection id="tasks" title="6. Tasks" summary={summary} open={open} onToggle={onToggle}>
      {error && <div style={{ fontSize: C.text.small, color: C.red, marginBottom: 12 }}>{error}</div>}
      {tasks && tasks.length === 0 && (
        <div style={{ fontSize: C.text.small, color: C.inkSoft, marginBottom: 16 }}>Nothing here yet.</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {tasks?.map((t) => (
          <TaskRow key={t.id} task={t} onUpdated={handleUpdated} />
        ))}
      </div>
      <NewTaskForm clientId={clientId} staff={staff} bordered={!!tasks?.length} onCreated={handleCreated} />
    </CollapsibleSection>
  );
}

function TaskRow({ task, onUpdated }: { task: Task; onUpdated: (t: Task) => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function transition(status: "confirmed" | "done") {
    setSubmitting(true);
    setError(null);
    try {
      const updated = await api.patch<Task>(`/api/tasks/${task.id}`, { status });
      onUpdated(updated);
    } catch {
      setError("Couldn't update that task.");
    } finally {
      setSubmitting(false);
    }
  }

  const overdue =
    task.due_date && new Date(task.due_date) < new Date(new Date().toDateString()) && task.status !== "done";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <Pill tone={STATUS_TONE[task.status]}>{STATUS_LABEL[task.status]}</Pill>
            {overdue && <Pill tone="red">overdue</Pill>}
          </div>
          <div style={{ fontSize: C.text.body, lineHeight: 1.5 }}>{task.text}</div>
          <div style={{ fontSize: C.text.small, color: C.inkSoft, marginTop: 4 }}>
            {task.owner_name}
            {task.due_date && ` · due ${fmtDate(task.due_date)}`}
            {task.source === "meeting_note" && " · from meeting note"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {task.status === "awaiting_sense_check" && (
            <Btn tone="ink" small disabled={submitting} onClick={() => transition("confirmed")}>
              Confirm
            </Btn>
          )}
          {task.status === "confirmed" && (
            <Btn tone="ghost" small disabled={submitting} onClick={() => transition("done")}>
              Mark done
            </Btn>
          )}
        </div>
      </div>
      {error && <div style={{ fontSize: C.text.small, color: C.red, marginTop: 6 }}>{error}</div>}
    </div>
  );
}

function NewTaskForm({
  clientId,
  staff,
  bordered,
  onCreated,
}: {
  clientId: number;
  staff: StaffUser[];
  bordered: boolean;
  onCreated: (t: Task) => void;
}) {
  const [text, setText] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || !ownerId) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.post<Task>(`/api/clients/${clientId}/tasks`, {
        text: text.trim(),
        owner_id: Number(ownerId),
        ...(dueDate ? { due_date: dueDate } : {}),
      });
      onCreated(created);
      setText("");
      setDueDate("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create that task.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      style={{
        display: "flex",
        gap: 10,
        marginTop: bordered ? 24 : 0,
        paddingTop: bordered ? 24 : 0,
        borderTop: bordered ? `1px solid ${C.line}` : undefined,
        flexWrap: "wrap",
      }}
    >
      <Input placeholder="Raise a task…" value={text} onChange={(e) => setText(e.target.value)} style={{ flex: "1 1 200px" }} />
      <Select value={ownerId} onChange={setOwnerId} placeholder="Owner">
        {staff.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
      <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ maxWidth: 160 }} />
      <Btn type="submit" tone="ink" disabled={submitting || !text.trim() || !ownerId}>
        Add
      </Btn>
      {error && <div style={{ width: "100%", fontSize: C.text.small, color: C.red }}>{error}</div>}
    </form>
  );
}
