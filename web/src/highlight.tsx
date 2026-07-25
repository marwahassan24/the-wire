import type { ReactNode } from "react";
import { theme as C } from "./theme.js";

// Matches the control-character markers the API's ts_headline call uses
// (see api/src/routes/search.ts) instead of HTML tags — so highlighting is
// built from real <mark> elements with React-escaped text content, never
// dangerouslySetInnerHTML. A stray '<' typed into a soft fact or meeting
// note can't become markup this way.
const HL_START = String.fromCharCode(1);
const HL_STOP = String.fromCharCode(2);

export function renderHighlighted(excerpt: string): ReactNode[] {
  const segments = excerpt.split(HL_START);
  const nodes: ReactNode[] = [segments[0]];
  for (let i = 1; i < segments.length; i++) {
    const stopIndex = segments[i].indexOf(HL_STOP);
    if (stopIndex === -1) {
      nodes.push(segments[i]);
      continue;
    }
    const marked = segments[i].slice(0, stopIndex);
    const rest = segments[i].slice(stopIndex + HL_STOP.length);
    nodes.push(
      <mark
        key={i}
        style={{ background: C.primarySoft, color: C.primary, borderRadius: 2, padding: "0 1px" }}
      >
        {marked}
      </mark>
    );
    nodes.push(rest);
  }
  return nodes;
}
