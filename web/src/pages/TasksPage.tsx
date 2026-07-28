import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { theme as C } from "../theme.js";
import { api } from "../api.js";
import { fmtDate } from "../format.js";
import type { Task } from "../types.js";
import { Btn, Card, Pill, Select } from "../components/ui.js";

const STATUS_TONE = {
  awaiting_sense_check: "amber",
  confirmed: "primary",
  done: "plain",
} as const;

const STATUS_LABEL: Record<Task["status"], string> = {
  awaiting_sense_check: "awaiting sense-check",
  confirmed: "confirmed",
  done: "done",
};

export function TasksPage() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [ownerOptions, setOwnerOptions] = useState<{ id: number; name: string }[]>([]);
  const [status, setStatus] = useState("");
  const [due, setDue] = useState("");
  const [owner, setOwner] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Task[]>("/api/tasks").then((all) => {
      const owners = new Map<number, string>();
      for (const t of all) owners.set(t.owner_id, t.owner_name);
      setOwnerOptions([...owners.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)));
    });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (due) params.set("due", due);
    if (owner) params.set("owner", owner);
    api
      .get<Task[]>(`/api/tasks?${params.toString()}`)
      .then(setTasks)
      .catch(() => setError("Couldn't load tasks."));
  }, [status, due, owner]);

  function handleUpdated(updated: Task) {
    setTasks((prev) => prev?.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)) ?? prev);
  }

  const overdueCount = useMemo(
    () => tasks?.filter((t) => t.due_date && new Date(t.due_date) < new Date(new Date().toDateString()) && t.status !== "done").length ?? 0,
    [tasks]
  );

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: C.text.title, marginBottom: 8 }}>Tasks</div>
      <div style={{ fontSize: C.text.small, color: C.inkSoft, marginBottom: 24 }}>
        {overdueCount > 0 ? `${overdueCount} overdue` : "Nothing overdue"}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 28, flexWrap: "wrap" }}>
        <Select value={status} onChange={setStatus} placeholder="All statuses">
          <option value="awaiting_sense_check">Awaiting sense-check</option>
          <option value="confirmed">Confirmed</option>
          <option value="done">Done</option>
        </Select>
        <Select value={due} onChange={setDue} placeholder="Any due date">
          <option value="today">Due today</option>
          <option value="overdue">Overdue</option>
        </Select>
        <Select value={owner} onChange={setOwner} placeholder="Any owner">
          {ownerOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
      </div>

      {error && <div style={{ color: C.red, fontSize: C.text.small }}>{error}</div>}
      {!tasks && !error && <div style={{ color: C.inkSoft, fontSize: C.text.small }}>Loading…</div>}
      {tasks && tasks.length === 0 && <div style={{ color: C.inkSoft, fontSize: C.text.small }}>No tasks match.</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {tasks?.map((t) => (
          <TaskRow key={t.id} task={t} onUpdated={handleUpdated} />
        ))}
      </div>
    </div>
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

  const overdue = task.due_date && new Date(task.due_date) < new Date(new Date().toDateString()) && task.status !== "done";

  return (
    <Card style={{ padding: "18px 22px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Pill tone={STATUS_TONE[task.status]}>{STATUS_LABEL[task.status]}</Pill>
            {overdue && <Pill tone="red">overdue</Pill>}
          </div>
          <div style={{ fontSize: C.text.body, lineHeight: 1.5 }}>{task.text}</div>
          <div style={{ fontSize: C.text.small, color: C.inkSoft, marginTop: 6 }}>
            <Link to={`/clients/${task.client_id}`} style={{ color: "inherit" }}>
              {task.client_first_names} {task.client_surname}
            </Link>
            {" · "}
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
      {error && <div style={{ fontSize: C.text.small, color: C.red, marginTop: 8 }}>{error}</div>}
    </Card>
  );
}
