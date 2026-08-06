// Pure date-calculation functions for "Days on the Planet" milestone
// alerts. No DB, no I/O, no reading of the current date except in
// todayInLondon() - every other function takes its dates as plain
// "YYYY-MM-DD" strings and returns the same, so it's fully testable with
// fixed inputs and never depends on the machine's local timezone.
//
// Arithmetic is done as a whole-day index (Date.UTC(y, m-1, d) / 86400000)
// rather than by diffing two Date objects' millisecond timestamps - both
// sides of every calculation are constructed the same way, at UTC
// midnight for a given calendar date, so DST transitions in any real
// timezone can never shift the result by a day. This mirrors how the
// rest of the app already does date-diffs (Postgres `date - date`
// arithmetic in ops.ts) - calendar-date math, not clock-time math.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export function isValidDateString(value: string): boolean {
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const [, yStr, mStr, dStr] = match;
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  const dayIndex = Date.UTC(y, m - 1, d);
  const roundTrip = new Date(dayIndex);
  // Date.UTC silently rolls invalid components (e.g. day 30 of February)
  // into the next month - reject anything that doesn't round-trip back
  // to the exact input, which catches that.
  return (
    roundTrip.getUTCFullYear() === y && roundTrip.getUTCMonth() === m - 1 && roundTrip.getUTCDate() === d
  );
}

function requireValidDate(value: string, label: string): void {
  if (!isValidDateString(value)) {
    throw new Error(`${label} is not a valid YYYY-MM-DD date: ${JSON.stringify(value)}`);
  }
}

function toDayIndex(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

function fromDayIndex(dayIndex: number): string {
  const date = new Date(dayIndex * MS_PER_DAY);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Whole calendar days between dateOfBirth and onDate. Negative if
// dateOfBirth is after onDate (a future DoB is a data error, not this
// function's problem to police - callers validate).
export function daysAliveOn(dateOfBirth: string, onDate: string): number {
  requireValidDate(dateOfBirth, "dateOfBirth");
  requireValidDate(onDate, "onDate");
  return toDayIndex(onDate) - toDayIndex(dateOfBirth);
}

export function addDays(dateStr: string, days: number): string {
  requireValidDate(dateStr, "dateStr");
  return fromDayIndex(toDayIndex(dateStr) + days);
}

// dateOfBirth + milestoneDays.
export function milestoneDateFor(dateOfBirth: string, milestoneDays: number): string {
  return addDays(dateOfBirth, milestoneDays);
}

// milestoneDate - warningDaysBefore.
export function alertDateFor(milestoneDate: string, warningDaysBefore: number): string {
  return addDays(milestoneDate, -warningDaysBefore);
}

// Real calendar age on a given date - not milestoneDays / 365. Whether
// the birthday has occurred yet that year is decided by comparing
// month/day components directly, so it's exact regardless of leap years.
export function ageOn(dateOfBirth: string, onDate: string): number {
  requireValidDate(dateOfBirth, "dateOfBirth");
  requireValidDate(onDate, "onDate");
  const [by, bm, bd] = dateOfBirth.split("-").map(Number);
  const [oy, om, od] = onDate.split("-").map(Number);
  let age = oy - by;
  if (om < bm || (om === bm && od < bd)) age -= 1;
  return age;
}

// "Today" in the business timezone - the CRM has no organisation-level
// timezone setting, so Europe/London per the brief. This is the only
// place in this module that reads the actual current time; everything
// else is pure and takes dates as arguments.
export function todayInLondon(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
}
