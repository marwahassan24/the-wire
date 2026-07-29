import { theme as C } from "../theme.js";

// Both AI Assistant and PIP-VEVE are finished standalone tools (see
// INTEGRATION_NOTE_for_Claude_Code.md) embedded verbatim via iframe so
// they render pixel-identical to what was built, rather than rebuilt as
// React components. This is the shared shell for both routes - just a
// heading plus a full-bleed frame, nothing tool-specific.
export function ToolFramePage({ title, src }: { title: string; src: string }) {
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: C.text.title, marginBottom: 16 }}>{title}</div>
      <iframe
        src={src}
        title={title}
        style={{
          display: "block",
          width: "100%",
          height: "calc(100vh - 220px)",
          border: "none",
          borderRadius: 8,
        }}
      />
    </div>
  );
}
