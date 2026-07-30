import { useState } from "react";
import { theme as C } from "../theme.js";
import { fmtDate } from "../format.js";
import type { RecentlyDeletedItem } from "../types.js";
import { Btn, Pill } from "./ui.js";

// Shared between the per-client "Recently deleted" section and the
// firm-wide "not tied to a client" view on Operations - same row shape,
// same restore action, different fetch scope above this component.
export function RecentlyDeletedList({
  items,
  onRestore,
  emptyText,
}: {
  items: RecentlyDeletedItem[];
  onRestore: (item: RecentlyDeletedItem) => Promise<void>;
  emptyText: string;
}) {
  const [restoringKey, setRestoringKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (items.length === 0) {
    return <div style={{ fontSize: C.text.small, color: C.inkSoft }}>{emptyText}</div>;
  }

  async function handleRestore(item: RecentlyDeletedItem) {
    const key = `${item.entity_type}:${item.entity_id}`;
    setRestoringKey(key);
    setError(null);
    try {
      await onRestore(item);
    } catch {
      setError(`Couldn't restore "${item.summary}".`);
    } finally {
      setRestoringKey(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {items.map((item) => {
        const key = `${item.entity_type}:${item.entity_id}`;
        return (
          <div
            key={key}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              paddingBottom: 12,
              borderBottom: `1px solid ${C.line}`,
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Pill tone="plain">{item.section}</Pill>
                {item.meta && <span style={{ fontSize: C.text.small, color: C.inkSoft }}>{item.meta}</span>}
              </div>
              <div style={{ fontSize: C.text.body, marginTop: 6 }}>{item.summary}</div>
              <div style={{ fontSize: C.text.small, color: C.inkSoft, marginTop: 4 }}>
                Deleted {fmtDate(item.deleted_at)}
                {item.deleted_by_name ? ` by ${item.deleted_by_name}` : ""}
              </div>
            </div>
            <Btn tone="ghost" small disabled={restoringKey === key} onClick={() => handleRestore(item)}>
              {restoringKey === key ? "Restoring…" : "Restore"}
            </Btn>
          </div>
        );
      })}
      {error && <div style={{ fontSize: C.text.small, color: C.red }}>{error}</div>}
    </div>
  );
}
