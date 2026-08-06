// node-postgres returns `date` columns as JS Date objects (built at UTC
// midnight for that calendar date, since this app sets no custom type
// parser) - this converts one back to a plain "YYYY-MM-DD" string, the
// same .toISOString().slice(0, 10) pattern MeetingNoteSection.tsx
// already uses for the same reason on the frontend.
export function dateOnlyFromDb(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return null;
}
