import { useEffect, useState, type FormEvent } from "react";
import { theme as C } from "../theme.js";
import { api, ApiError } from "../api.js";
import { fmtDate } from "../format.js";
import type { OutstandingItem, OutstandingItemChase, StaffUser } from "../types.js";
import { Btn, CollapsibleSection, Input, Pill, Select } from "./ui.js";

export const OUTSTANDING_TYPE_LABEL: Record<OutstandingItem["type"], string> = {
  loa: "LOA",
  signature: "Signature",
  transfer: "Transfer",
};

const STATUS_TONE = { outstanding: "amber", received: "primary", cancelled: "plain" } as const;

export function OutstandingItemsSection({
  clientId,
  outstandingItems,
  onChange,
  open,
  onToggle,
}: {
  clientId: number;
  outstandingItems: OutstandingItem[];
  onChange: (items: OutstandingItem[]) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [newType, setNewType] = useState<OutstandingItem["type"] | "">("loa");
  const [newDescription, setNewDescription] = useState("");
  const [newOwnerId, setNewOwnerId] = useState("");
  const [newRaisedAt, setNewRaisedAt] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<StaffUser[]>("/api/users")
      .then(setStaff)
      .catch(() => {});
  }, []);

  const outstandingCount = outstandingItems.filter((i) => i.status === "outstanding").length;
  const summary =
    outstandingItems.length === 0
      ? "(empty)"
      : outstandingCount === 0
        ? "(all resolved)"
        : `(${outstandingCount} outstanding)`;

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!newDescription.trim() || !newOwnerId || !newType) return;
    setAdding(true);
    setError(null);
    try {
      const created = await api.post<OutstandingItem>(`/api/clients/${clientId}/outstanding-items`, {
        type: newType,
        description: newDescription.trim(),
        owner_id: Number(newOwnerId),
        ...(newRaisedAt ? { raised_at: newRaisedAt } : {}),
      });
      onChange(
        [created, ...outstandingItems].sort((a, b) => (a.raised_at < b.raised_at ? -1 : a.raised_at > b.raised_at ? 1 : 0))
      );
      setNewType("loa");
      setNewDescription("");
      setNewOwnerId("");
      setNewRaisedAt("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't add that.");
    } finally {
      setAdding(false);
    }
  }

  function handleUpdated(updated: OutstandingItem) {
    onChange(outstandingItems.map((i) => (i.id === updated.id ? updated : i)));
  }

  function handleDeleted(id: number) {
    onChange(outstandingItems.filter((i) => i.id !== id));
  }

  return (
    <CollapsibleSection
      id="outstanding-items"
      title="9. Outstanding items"
      summary={summary}
      open={open}
      onToggle={onToggle}
    >
      {outstandingItems.length === 0 && (
        <div style={{ fontSize: C.text.small, color: C.inkSoft, marginBottom: 16 }}>Nothing here yet.</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {outstandingItems.map((item) => (
          <OutstandingItemRow key={item.id} item={item} onUpdated={handleUpdated} onDeleted={handleDeleted} />
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
        <Select value={newType} onChange={(v) => setNewType(v as OutstandingItem["type"] | "")} placeholder="Type">
          <option value="loa">LOA</option>
          <option value="signature">Signature</option>
          <option value="transfer">Transfer</option>
        </Select>
        <Input
          placeholder="Description…"
          value={newDescription}
          onChange={(e) => setNewDescription(e.target.value)}
          style={{ flex: "1 1 200px" }}
        />
        <Select value={newOwnerId} onChange={setNewOwnerId} placeholder="Owner">
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Input
          type="date"
          value={newRaisedAt}
          onChange={(e) => setNewRaisedAt(e.target.value)}
          style={{ maxWidth: 160 }}
        />
        <Btn type="submit" tone="ink" disabled={adding || !newDescription.trim() || !newOwnerId || !newType}>
          Add
        </Btn>
      </form>
      {error && <div style={{ fontSize: C.text.small, color: C.red, marginTop: 8 }}>{error}</div>}
    </CollapsibleSection>
  );
}

function OutstandingItemRow({
  item,
  onUpdated,
  onDeleted,
}: {
  item: OutstandingItem;
  onUpdated: (i: OutstandingItem) => void;
  onDeleted: (id: number) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(status: "received" | "cancelled") {
    setSubmitting(true);
    setError(null);
    try {
      const updated = await api.patch<OutstandingItem>(`/api/outstanding-items/${item.id}`, { status });
      onUpdated(updated);
    } catch {
      setError("Couldn't update that.");
    } finally {
      setSubmitting(false);
    }
  }

  async function logChase() {
    setSubmitting(true);
    setError(null);
    try {
      const chase = await api.post<OutstandingItemChase>(`/api/outstanding-items/${item.id}/chases`, {});
      onUpdated({ ...item, chases: [chase, ...item.chases] });
    } catch {
      setError("Couldn't log that chase.");
    } finally {
      setSubmitting(false);
    }
  }

  async function remove() {
    if (!window.confirm("Remove this outstanding item? It stays on record, just hidden.")) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.delete(`/api/outstanding-items/${item.id}`);
      onDeleted(item.id);
    } catch {
      setError("Couldn't remove that.");
      setSubmitting(false);
    }
  }

  const lastChase = item.chases[0] ?? null;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Pill tone="plain">{OUTSTANDING_TYPE_LABEL[item.type]}</Pill>
          <Pill tone={STATUS_TONE[item.status]}>{item.status}</Pill>
          <span style={{ fontSize: C.text.small, color: C.inkSoft }}>
            raised {fmtDate(item.raised_at)} · {item.owner_name}
          </span>
        </div>
        {item.status === "outstanding" && (
          <div style={{ display: "flex", gap: 8 }}>
            <Btn tone="ghost" small disabled={submitting} onClick={logChase}>
              Log a chase
            </Btn>
            <Btn tone="ghost" small disabled={submitting} onClick={() => setStatus("received")}>
              Mark received
            </Btn>
            <Btn tone="ghost" small disabled={submitting} onClick={() => setStatus("cancelled")}>
              Cancel
            </Btn>
            <Btn tone="ghost" small disabled={submitting} onClick={remove}>
              Remove
            </Btn>
          </div>
        )}
        {item.status !== "outstanding" && (
          <Btn tone="ghost" small disabled={submitting} onClick={remove}>
            Remove
          </Btn>
        )}
      </div>
      <div style={{ fontSize: C.text.body, lineHeight: 1.6, marginTop: 6 }}>{item.description}</div>
      <div style={{ fontSize: C.text.small, color: C.inkSoft, marginTop: 6 }}>
        {item.chases.length === 0
          ? "Not chased yet."
          : `Chased ${item.chases.length} time${item.chases.length === 1 ? "" : "s"}, last ${fmtDate(lastChase!.chased_at)} by ${lastChase!.chased_by_name}.`}
      </div>
      {error && <div style={{ fontSize: C.text.small, color: C.red, marginTop: 6 }}>{error}</div>}
    </div>
  );
}
