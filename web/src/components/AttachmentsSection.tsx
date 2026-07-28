import { useRef, useState, type FormEvent } from "react";
import { theme as C } from "../theme.js";
import { api, ApiError, API_URL } from "../api.js";
import { fmtBytes, fmtDate } from "../format.js";
import type { Attachment } from "../types.js";
import { Btn, CollapsibleSection, Input } from "./ui.js";

export function AttachmentsSection({
  clientId,
  attachments,
  onChange,
  open,
  onToggle,
}: {
  clientId: number;
  attachments: Attachment[];
  onChange: (attachments: Attachment[]) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const summary = attachments.length === 0 ? "(empty)" : `(${attachments.length})`;
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      if (note.trim()) formData.append("note", note.trim());
      formData.append("file", file);
      const created = await api.upload<Attachment>(`/api/clients/${clientId}/attachments`, formData);
      onChange([created, ...attachments]);
      setNote("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't upload that file.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Remove this document from the list? It stays on record, just hidden.")) return;
    setDeletingId(id);
    try {
      await api.delete(`/api/attachments/${id}`);
      onChange(attachments.filter((a) => a.id !== id));
    } catch {
      setError("Couldn't remove that document.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <CollapsibleSection id="documents" title="5. Documents" summary={summary} open={open} onToggle={onToggle}>
      {attachments.length === 0 && (
        <div style={{ fontSize: C.text.small, color: C.inkSoft, marginBottom: 16 }}>Nothing here yet.</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {attachments.map((a) => (
          <div key={a.id} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontSize: C.text.body, fontWeight: 600 }}>{a.filename}</div>
              <div style={{ fontSize: C.text.small, color: C.inkSoft, marginTop: 2 }}>
                {fmtDate(a.created_at)} · {a.uploaded_by_name} · {fmtBytes(a.size_bytes)}
              </div>
              {a.note && <div style={{ fontSize: C.text.small, color: C.ink, marginTop: 4 }}>{a.note}</div>}
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <a
                href={`${API_URL}/api/attachments/${a.id}/download`}
                style={{ fontSize: C.text.small, color: C.primary, textDecoration: "none", fontWeight: 600, alignSelf: "center" }}
              >
                Download
              </a>
              <Btn tone="ghost" small disabled={deletingId === a.id} onClick={() => handleDelete(a.id)}>
                Remove
              </Btn>
            </div>
          </div>
        ))}
      </div>

      <form
        onSubmit={handleUpload}
        style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 24, paddingTop: 24, borderTop: `1px solid ${C.line}` }}
      >
        <input ref={fileRef} type="file" style={{ fontSize: C.text.small }} />
        <div style={{ display: "flex", gap: 10 }}>
          <Input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <Btn type="submit" tone="ink" disabled={uploading}>
            Upload
          </Btn>
        </div>
      </form>
      {error && <div style={{ fontSize: C.text.small, color: C.red, marginTop: 8 }}>{error}</div>}
    </CollapsibleSection>
  );
}
