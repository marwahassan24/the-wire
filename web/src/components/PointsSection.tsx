import { useState, type FormEvent } from "react";
import { theme as C } from "../theme.js";
import { api, ApiError } from "../api.js";
import type { Point } from "../types.js";
import { Btn, Card, Input, Pill, SectionHeading } from "./ui.js";

const POINT_TONE = { open: "amber", carried: "amber", resolved: "plain" } as const;

export function PointsSection({
  clientId,
  points,
  onChange,
}: {
  clientId: number;
  points: Point[];
  onChange: (points: Point[]) => void;
}) {
  const [newText, setNewText] = useState("");
  const [raising, setRaising] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRaise(e: FormEvent) {
    e.preventDefault();
    if (!newText.trim()) return;
    setRaising(true);
    setError(null);
    try {
      const created = await api.post<Point>(`/api/clients/${clientId}/points`, { text: newText.trim() });
      onChange([...points, created].sort((a, b) => a.number - b.number));
      setNewText("");
    } catch {
      setError("Couldn't raise that point.");
    } finally {
      setRaising(false);
    }
  }

  function handleUpdated(updated: Point) {
    onChange(points.map((p) => (p.id === updated.id ? updated : p)));
  }

  return (
    <Card>
      <SectionHeading>2. Points to note and discuss</SectionHeading>
      {points.length === 0 && (
        <div style={{ fontSize: C.text.small, color: C.inkSoft, marginBottom: 16 }}>Nothing here yet.</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {points.map((p) => (
          <PointRow key={p.id} point={p} onUpdated={handleUpdated} />
        ))}
      </div>

      <form
        onSubmit={handleRaise}
        style={{ display: "flex", gap: 10, marginTop: 24, paddingTop: 24, borderTop: `1px solid ${C.line}` }}
      >
        <Input
          placeholder="Raise a new point…"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
        />
        <Btn type="submit" tone="ink" disabled={raising || !newText.trim()}>
          Raise
        </Btn>
      </form>
      {error && <div style={{ fontSize: C.text.small, color: C.red, marginTop: 8 }}>{error}</div>}
    </Card>
  );
}

function PointRow({ point, onUpdated }: { point: Point; onUpdated: (p: Point) => void }) {
  const [action, setAction] = useState<"carry" | "resolve" | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(status: "carried" | "resolved") {
    if (!note.trim()) {
      setError("A resolution note is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const updated = await api.patch<Point>(`/api/points/${point.id}`, {
        status,
        resolution_note: note.trim(),
      });
      onUpdated(updated);
      setAction(null);
      setNote("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't update that point.");
    } finally {
      setSubmitting(false);
    }
  }

  const canAct = point.status !== "resolved";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: C.text.small, fontWeight: 600, color: C.inkSoft }}>#{point.number}</span>
        <Pill tone={POINT_TONE[point.status]}>{point.status}</Pill>
        {point.raised_context && (
          <span style={{ fontSize: C.text.small, color: C.inkSoft }}>{point.raised_context}</span>
        )}
      </div>
      <div style={{ fontSize: C.text.body, lineHeight: 1.6 }}>{point.text}</div>
      {point.resolution_note && (
        <div style={{ fontSize: C.text.small, color: C.inkSoft, marginTop: 6 }}>↳ {point.resolution_note}</div>
      )}

      {canAct && action === null && (
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <Btn tone="ghost" small onClick={() => setAction("carry")}>
            Carry
          </Btn>
          <Btn tone="ghost" small onClick={() => setAction("resolve")}>
            Resolve
          </Btn>
        </div>
      )}

      {action !== null && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <Input
            placeholder={action === "carry" ? "Why is this carrying forward?" : "How was this resolved?"}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            autoFocus
          />
          <div style={{ display: "flex", gap: 8 }}>
            <Btn
              tone="ink"
              small
              disabled={submitting}
              onClick={() => submit(action === "carry" ? "carried" : "resolved")}
            >
              {action === "carry" ? "Carry forward" : "Mark resolved"}
            </Btn>
            <Btn
              tone="ghost"
              small
              onClick={() => {
                setAction(null);
                setNote("");
                setError(null);
              }}
            >
              Cancel
            </Btn>
          </div>
          {error && <div style={{ fontSize: C.text.small, color: C.red }}>{error}</div>}
        </div>
      )}
    </div>
  );
}
