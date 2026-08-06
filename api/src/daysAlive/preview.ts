import { addDays, todayInLondon } from "./calc.js";
import { runDailyCheck, type DaysAliveMatch } from "./runDailyCheck.js";

export interface PreviewUpcomingResult {
  fromDate: string;
  toDate: string;
  matches: DaysAliveMatch[];
}

// Runs the same matching logic as the real daily job, once per day in
// the window, in dry-run mode (nothing written, nothing sent) - so
// "preview the next 30/60/90 days" can never drift from what the job
// would actually do when that day arrives for real.
export async function previewUpcoming(daysAhead: number, fromDate?: string): Promise<PreviewUpcomingResult> {
  const start = fromDate ?? todayInLondon();
  const matches: DaysAliveMatch[] = [];
  for (let i = 0; i <= daysAhead; i++) {
    const date = addDays(start, i);
    const result = await runDailyCheck({ asOfDate: date, dryRun: true, collectMatches: true });
    matches.push(...result.matches);
  }
  matches.sort((a, b) => (a.alertDate < b.alertDate ? -1 : a.alertDate > b.alertDate ? 1 : a.clientId - b.clientId));
  return { fromDate: start, toDate: addDays(start, daysAhead), matches };
}
