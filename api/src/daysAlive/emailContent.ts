// Builds the milestone-alert email subject/body. Pure and testable -
// takes plain data in, returns strings out, no DB/date-library calls.

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Formats a "YYYY-MM-DD" string as "27 April 2026" without going through
// a Date object (which would reintroduce a timezone to get wrong).
function formatDateForEmail(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export interface MilestoneEmailInput {
  fullName: string;
  milestoneDays: number;
  ageOnMilestone: number;
  milestoneDate: string;
  alertDate: string;
  sendCardByDate: string;
}

export function buildMilestoneEmailSubject(input: MilestoneEmailInput): string {
  return `Upcoming milestone: ${input.fullName} — ${input.milestoneDays.toLocaleString("en-GB")} days`;
}

export function buildMilestoneEmailBody(input: MilestoneEmailInput): string {
  return [
    "Days on the Planet — Milestone Alert",
    "",
    `Client: ${input.fullName}`,
    `Milestone: ${input.milestoneDays.toLocaleString("en-GB")} days`,
    `Age on that date: ${input.ageOnMilestone} years old`,
    `Milestone date: ${formatDateForEmail(input.milestoneDate)}`,
    `Send card by: ${formatDateForEmail(input.sendCardByDate)}`,
  ].join("\n");
}
