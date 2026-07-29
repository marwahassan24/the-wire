// Both AI Assistant and PIP-VEVE are finished standalone tools (see
// INTEGRATION_NOTE_for_Claude_Code.md) embedded verbatim via iframe so
// they render pixel-identical to what was built, rather than rebuilt as
// React components. This is the shared shell for both routes. No page
// heading above the frame - both tools already open with their own large
// header/hero inside the iframe, so a second title here was pure
// duplication that just pushed the tool further down the page.
export function ToolFramePage({ title, src }: { title: string; src: string }) {
  return (
    <iframe
      src={src}
      title={title}
      style={{
        display: "block",
        width: "100%",
        height: "calc(100vh - 160px)",
        border: "none",
        borderRadius: 8,
      }}
    />
  );
}
