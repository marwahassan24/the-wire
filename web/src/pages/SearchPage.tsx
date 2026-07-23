import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { theme as C } from "../theme.js";
import { api } from "../api.js";
import { fmtDate } from "../format.js";
import { renderHighlighted } from "../highlight.js";
import type { SearchResult } from "../types.js";
import { Card, Input, Pill } from "../components/ui.js";

const ENTITY_LABEL: Record<SearchResult["entity_type"], string> = {
  soft_fact: "Soft fact",
  point: "Point",
  meeting_note: "Meeting note",
  portfolio_summary: "Portfolio",
};

export function SearchPage() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!q.trim()) {
      setResults(null);
      setError(null);
      return;
    }
    setLoading(true);
    const handle = setTimeout(() => {
      api
        .get<SearchResult[]>(`/api/search?q=${encodeURIComponent(q.trim())}`)
        .then((r) => {
          setResults(r);
          setError(null);
        })
        .catch(() => setError("Search failed."))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [q]);

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: C.text.title, marginBottom: 8 }}>Search</div>
      <div style={{ fontSize: C.text.small, color: C.inkSoft, marginBottom: 24 }}>
        Across soft facts, points, meeting notes, and portfolio summaries, every client.
      </div>

      <Input
        placeholder={`Try: an interest ("golf"), a theme ("gifting", "IHT")…`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ marginBottom: 28, maxWidth: 480 }}
        autoFocus
      />

      {error && <div style={{ color: C.red, fontSize: C.text.small }}>{error}</div>}
      {loading && <div style={{ color: C.inkSoft, fontSize: C.text.small }}>Searching…</div>}
      {!loading && results && results.length === 0 && (
        <div style={{ color: C.inkSoft, fontSize: C.text.small }}>No matches for "{q.trim()}".</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {results?.map((r, i) => (
          <Card key={`${r.entity_type}-${r.entity_id}-${i}`} style={{ padding: "18px 22px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <Pill tone="plain">{ENTITY_LABEL[r.entity_type]}</Pill>
              <Link
                to={`/clients/${r.client_id}`}
                style={{ fontSize: C.text.small, fontWeight: 600, color: C.primary, textDecoration: "none" }}
              >
                {r.client_first_names} {r.client_surname}
              </Link>
              {r.entry_date && <span style={{ fontSize: C.text.small, color: C.inkSoft }}>{fmtDate(r.entry_date)}</span>}
            </div>
            <div style={{ fontSize: C.text.body, lineHeight: 1.6 }}>{renderHighlighted(r.excerpt)}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}
