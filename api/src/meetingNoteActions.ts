// Reads a meeting note's body for the same "TCFP:" / "Client:" convention
// the original prototype (the-wire.jsx) used to draft tasks from the
// "Next steps & actions" section - one line, one candidate task. Pure and
// DB-free so the parsing rules are testable on their own.

export interface ExtractedAction {
  kind: "tcfp" | "client";
  text: string;
}

const ACTION_LINE = /^(tcfp|client)\s*:\s*(.+)$/i;

// Next-steps lines are commonly written as a bulleted list ("- TCFP: ...",
// "• Client: ..."). Strip a leading bullet marker before matching, so the
// label still has to open the line - this doesn't loosen the match, it
// just looks past the punctuation a bullet list adds in front of it.
const BULLET_PREFIX = /^[-*•‣·]+\s*/;

export function extractActionLines(body: string): ExtractedAction[] {
  const actions: ExtractedAction[] = [];
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim().replace(BULLET_PREFIX, "");
    const match = ACTION_LINE.exec(line);
    if (!match) continue;
    const text = match[2].trim();
    if (!text) continue;
    actions.push({ kind: match[1].toLowerCase() === "tcfp" ? "tcfp" : "client", text });
  }
  return actions;
}

// "TCFP:" lines are our own action, stated as-is. "Client:" lines are
// reworded as the thing we're chasing them for, not restated as an
// instruction to the client - the task belongs to us either way.
export function taskTextForAction(action: ExtractedAction): string {
  return action.kind === "tcfp" ? action.text : `Client action - ${action.text}`;
}
