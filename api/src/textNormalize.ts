// Jeremy dislikes em dashes. Adviser-typed narrative content should never
// carry one into the permanent record, so normalise to a plain hyphen on
// the way in — this is what catches one typed later, not just what was in
// the seed data.
export function normalizeText(value: string): string {
  return value.replace(/—/g, "-");
}
