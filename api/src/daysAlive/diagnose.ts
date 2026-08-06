import { pool } from "../db.js";
import { alertDateFor, daysAliveOn, milestoneDateFor, todayInLondon } from "./calc.js";
import { dateOnlyFromDb } from "./dbDate.js";
import { loadSettings } from "./settings.js";

export interface DiagnoseInput {
  clientId: number;
  milestoneDays: number;
  // Both optional - computed from dob / today if not given, but
  // accepting them lets this answer "what would this have looked like
  // on some other date" too.
  milestoneDate?: string;
  evaluationDate?: string;
}

export interface DiagnoseResult {
  clientId: number;
  dateOfBirth: string | null;
  milestoneDays: number;
  milestoneDate: string | null;
  alertDate: string | null;
  evaluationDate: string;
  daysAliveOnEvaluationDate: number | null;
  milestoneEnabled: boolean | null;
  alertRecordExists: boolean;
  alertStatus: "pending" | "sent" | "failed" | "skipped" | null;
  emailSent: boolean;
  failureReason: string | null;
}

// Answers "should this client have received an alert for this
// milestone?" from first principles, cross-referenced against whatever
// actually happened in days_alive_alerts - the tool the old Power
// Automate system had no equivalent of, since it only kept run logs for
// 28 days. Every input here is recomputed live from clients.dob, not
// read off a cached/stored figure.
export async function diagnoseAlert(input: DiagnoseInput): Promise<DiagnoseResult> {
  const evaluationDate = input.evaluationDate ?? todayInLondon();
  const settings = await loadSettings();

  const { rows: clientRows } = await pool.query<{ dob: unknown }>(`SELECT dob FROM clients WHERE id = $1`, [
    input.clientId,
  ]);
  const dob = clientRows.length > 0 ? dateOnlyFromDb(clientRows[0].dob) : null;

  const milestoneDate = input.milestoneDate ?? (dob ? milestoneDateFor(dob, input.milestoneDays) : null);
  const alertDate = milestoneDate ? alertDateFor(milestoneDate, settings.warningDaysBefore) : null;
  const daysAliveOnEvaluationDate = dob ? daysAliveOn(dob, evaluationDate) : null;

  const { rows: milestoneRows } = await pool.query<{ enabled: boolean }>(
    `SELECT enabled FROM days_alive_milestones WHERE days = $1`,
    [input.milestoneDays]
  );
  const milestoneEnabled = milestoneRows.length > 0 ? milestoneRows[0].enabled : null;

  const { rows: alertRows } = await pool.query<{
    status: "pending" | "sent" | "failed" | "skipped";
    error_message: string | null;
  }>(
    `SELECT status, error_message FROM days_alive_alerts
      WHERE client_id = $1 AND milestone_days = $2 AND alert_days_before = $3`,
    [input.clientId, input.milestoneDays, settings.warningDaysBefore]
  );
  const alertRow = alertRows[0] ?? null;

  return {
    clientId: input.clientId,
    dateOfBirth: dob,
    milestoneDays: input.milestoneDays,
    milestoneDate,
    alertDate,
    evaluationDate,
    daysAliveOnEvaluationDate,
    milestoneEnabled,
    alertRecordExists: alertRow !== null,
    alertStatus: alertRow?.status ?? null,
    emailSent: alertRow?.status === "sent",
    failureReason: alertRow?.error_message ?? null,
  };
}
