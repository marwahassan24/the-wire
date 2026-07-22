import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { theme as C } from "../theme.js";
import { api } from "../api.js";
import { fmtDate } from "../format.js";
import type { Task } from "../types.js";
import { Btn, Card, Pill } from "../components/ui.js";

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
      <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 4 }}>Tasks</div>
      <div style={{ fontSize: 12.5, color: C.inkSoft, marginBottom: 16 }}>
        {overdueCount > 0 ? `${overdueCount} overdue` : "Nothing overdue"}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
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

      {error && <div style={{ color: C.red, fontSize: 13 }}>{error}</div>}
      {!tasks && !error && <div style={{ color: C.inkSoft, fontSize: 13 }}>Loading…</div>}
      {tasks && tasks.length === 0 && <div style={{ color: C.inkSoft, fontSize: 13 }}>No tasks match.</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {tasks?.map((t) => (
          <TaskRow key={t.id} task={t} onUpdated={handleUpdated} />
        ))}
      </div>
    </div>
  );
}

function Select({
  value,
  onChange,
  placeholder,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        fontFamily: C.sans,
        fontSize: 13,
        padding: "7px 10px",
        borderRadius: 4,
        border: `1px solid ${C.line}`,
        background: "#fff",
        color: C.ink,
      }}
    >
      <option value="">{placeholder}</option>
      {children}
    </select>
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
    <Card style={{ padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Pill tone={STATUS_TONE[task.status]}>{STATUS_LABEL[task.status]}</Pill>
            {overdue && <Pill tone="red">overdue</Pill>}
          </div>
          <div style={{ fontSize: 13.5 }}>{task.text}</div>
          <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 3 }}>
            <Link to={`/clients/${task.client_id}`} style={{ color: "inherit" }}>
              {task.client_first_names} {task.client_surname}
            </Link>
            {" · "}
            {task.owner_name}
            {task.due_date && ` · due ${fmtDate(task.due_date)}`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
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
      {error && <div style={{ fontSize: 12, color: C.red, marginTop: 6 }}>{error}</div>}
    </Card>
  );
}
