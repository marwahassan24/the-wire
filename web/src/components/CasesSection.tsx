import { useEffect, useState, type FormEvent } from "react";
import { theme as C } from "../theme.js";
import { api, ApiError } from "../api.js";
import type { Case, StaffUser } from "../types.js";
import { Btn, Card, Input, Pill, SectionHeading, Select } from "./ui.js";

const WAITING_LABEL: Record<string, string> = {
  us: "us",
  client: "client",
  provider: "provider",
  third_party: "third party",
};

// GET /api/cases has no client filter (stage/waiting_on/owner only) -
// fetch everything and keep just this client's. Stage transitions live
// on the Ops page's pipeline view, not duplicated here - this section is
// create + read-only context only.
export function CasesSection({ clientId }: { clientId: number }) {
  const [cases, setCases] = useState<Case[] | null>(null);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Case[]>("/api/cases")
      .then((all) => setCases(all.filter((k) => k.client_id === clientId)))
      .catch(() => setError("Couldn't load cases."));
    api.get<StaffUser[]>("/api/users").then(setStaff).catch(() => {});
  }, [clientId]);

  function handleCreated(kase: Case) {
    setCases((prev) => (prev ? [kase, ...prev] : [kase]));
  }

  return (
    <Card>
      <SectionHeading>7. Cases</SectionHeading>
      {error && <div style={{ fontSize: C.text.small, color: C.red, marginBottom: 12 }}>{error}</div>}
      {cases && cases.length === 0 && (
        <div style={{ fontSize: C.text.small, color: C.inkSoft, marginBottom: 16 }}>Nothing here yet.</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {cases?.map((k) => (
          <div key={k.id}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: C.text.small, fontWeight: 600, color: C.primary }}>{k.stage}</span>
              {k.waiting_on && <Pill tone="plain">with {WAITING_LABEL[k.waiting_on]}</Pill>}
            </div>
            <div style={{ fontSize: C.text.body, lineHeight: 1.5 }}>{k.title}</div>
          </div>
        ))}
      </div>
      <NewCaseForm clientId={clientId} staff={staff} bordered={!!cases?.length} onCreated={handleCreated} />
    </Card>
  );
}

function NewCaseForm({
  clientId,
  staff,
  bordered,
  onCreated,
}: {
  clientId: number;
  staff: StaffUser[];
  bordered: boolean;
  onCreated: (k: Case) => void;
}) {
  const [title, setTitle] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.post<Case>(`/api/clients/${clientId}/cases`, {
        title: title.trim(),
        ...(ownerId ? { owner_id: Number(ownerId) } : {}),
      });
      onCreated(created);
      setTitle("");
      setOwnerId("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't open that case.");
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
      <Input
        placeholder="Open a new case…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={{ flex: "1 1 200px" }}
      />
      <Select value={ownerId} onChange={setOwnerId} placeholder="Owner (optional)">
        {staff.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
      <Btn type="submit" tone="ink" disabled={submitting || !title.trim()}>
        Open
      </Btn>
      {error && <div style={{ width: "100%", fontSize: C.text.small, color: C.red }}>{error}</div>}
    </form>
  );
}
