import { useEffect, useState } from "react";
import { theme as C } from "../theme.js";
import { api } from "../api.js";
import type { RecentlyDeletedItem } from "../types.js";
import { CollapsibleSection } from "./ui.js";
import { RecentlyDeletedList } from "./RecentlyDeletedList.js";

// Soft-deleted records are otherwise invisible from the app - this is the
// safety net actually being reachable, not just existing in the DB. Any
// authenticated user can see and restore, same as any authenticated user
// can already delete these records in the first place - see the commit
// message for the reasoning on not adding a new asymmetric permission
// tier the rest of the app doesn't have yet.
export function RecentlyDeletedSection({
  clientId,
  open,
  onToggle,
  onRestored,
}: {
  clientId: number;
  open: boolean;
  onToggle: () => void;
  onRestored: () => void;
}) {
  const [items, setItems] = useState<RecentlyDeletedItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setItems(null);
    setLoadError(null);
    api
      .get<RecentlyDeletedItem[]>(`/api/clients/${clientId}/recently-deleted`)
      .then(setItems)
      .catch(() => setLoadError("Couldn't load recently deleted items."));
  }, [clientId]);

  async function handleRestore(item: RecentlyDeletedItem) {
    await api.post(`/api/recently-deleted/${item.entity_type}/${item.entity_id}/restore`);
    setItems((prev) =>
      prev ? prev.filter((i) => !(i.entity_type === item.entity_type && i.entity_id === item.entity_id)) : prev
    );
    onRestored();
  }

  const summary = !items ? "" : items.length === 0 ? "(empty)" : `(${items.length})`;

  return (
    <CollapsibleSection id="recently-deleted" title="10. Recently deleted" summary={summary} open={open} onToggle={onToggle}>
      {loadError && <div style={{ fontSize: C.text.small, color: C.red }}>{loadError}</div>}
      {!loadError && !items && <div style={{ fontSize: C.text.small, color: C.inkSoft }}>Loading…</div>}
      {!loadError && items && (
        <RecentlyDeletedList
          items={items}
          onRestore={handleRestore}
          emptyText="Nothing deleted from this client's record."
        />
      )}
    </CollapsibleSection>
  );
}
