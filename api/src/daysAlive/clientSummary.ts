import { pool } from "../db.js";
import { daysAliveOn, milestoneDateFor, todayInLondon } from "./calc.js";
import { dateOnlyFromDb } from "./dbDate.js";

export interface DaysAliveNextMilestone {
  days: number;
  date: string;
  daysUntil: number;
}

export interface DaysAliveAlertSummary {
  id: number;
  milestoneDays: number;
  milestoneDate: string;
  alertDate: string;
  status: "pending" | "sent" | "failed" | "skipped";
  sentAt: string | null;
}

export interface ClientDaysAliveSummary {
  dateOfBirth: string;
  daysAlive: number;
  nextMilestone: DaysAliveNextMilestone | null;
  alerts: DaysAliveAlertSummary[];
}

// Everything here is computed live from clients.dob on every call -
// nothing is read from a stored "days alive" figure, and there isn't
// one to accidentally go stale.
export async function getClientDaysAliveSummary(clientId: number, dobValue: unknown): Promise<ClientDaysAliveSummary | null> {
  const dob = dateOnlyFromDb(dobValue);
  if (dob === null) return null;

  const today = todayInLondon();
  const daysAlive = daysAliveOn(dob, today);

  const { rows: milestoneRows } = await pool.query<{ days: number }>(
    `SELECT days FROM days_alive_milestones WHERE enabled = true ORDER BY days`
  );
  let nextMilestone: DaysAliveNextMilestone | null = null;
  for (const { days } of milestoneRows) {
    if (days > daysAlive) {
      nextMilestone = { days, date: milestoneDateFor(dob, days), daysUntil: days - daysAlive };
      break;
    }
  }

  const { rows: alertRows } = await pool.query<{
    id: number;
    milestone_days: number;
    milestone_date: unknown;
    alert_date: unknown;
    status: "pending" | "sent" | "failed" | "skipped";
    sent_at: unknown;
  }>(
    `SELECT id, milestone_days, milestone_date, alert_date, status, sent_at
       FROM days_alive_alerts
      WHERE client_id = $1
      ORDER BY milestone_date DESC`,
    [clientId]
  );

  return {
    dateOfBirth: dob,
    daysAlive,
    nextMilestone,
    alerts: alertRows.map((r) => ({
      id: r.id,
      milestoneDays: r.milestone_days,
      milestoneDate: dateOnlyFromDb(r.milestone_date)!,
      alertDate: dateOnlyFromDb(r.alert_date)!,
      status: r.status,
      sentAt: r.sent_at instanceof Date ? r.sent_at.toISOString() : (r.sent_at as string | null),
    })),
  };
}
