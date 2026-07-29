export function fmtDate(d: string | null): string {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fmtGBP(n: number): string {
  return `£${Math.round(n).toLocaleString("en-GB")}`;
}

// Portfolio summaries render as a bulleted list, but advisers don't
// reliably type one point per line - most just write a paragraph of
// sentences. Splitting on newline alone (the original approach) left a
// whole paragraph sitting inside a single bullet whenever there weren't
// any literal line breaks in it. This splits on explicit line breaks
// first (an adviser who does type each point on its own line gets
// exactly that, unchanged), then further splits any remaining line on
// sentence boundaries - a ".", "!" or "?" followed by whitespace and a
// capital letter, a digit, or "£". The lookahead requires whitespace
// immediately after the punctuation, so it won't fire inside a decimal
// like "3.5%" (no space there); the negative lookbehind stops it firing
// straight after a title like "Mr." or "Dr." (plausible in notes that
// name a client), so "Discussed with Mr. Smith." survives as one bullet
// instead of splitting mid-name.
const SENTENCE_BOUNDARY = /(?<!\b(?:Mr|Mrs|Ms|Mx|Dr|Prof)\.)(?<=[.!?])\s+(?=[A-Z£0-9])/;

export function splitIntoBulletLines(text: string): string[] {
  return text
    .split("\n")
    .flatMap((line) => line.split(SENTENCE_BOUNDARY))
    .map((line) => line.trim())
    .filter(Boolean);
}
