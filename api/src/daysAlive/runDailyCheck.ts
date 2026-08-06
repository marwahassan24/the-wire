import { pool } from "../db.js";
import { ageOn, addDays, alertDateFor, isValidDateString, milestoneDateFor, todayInLondon } from "./calc.js";
import { dateOnlyFromDb } from "./dbDate.js";
import { buildMilestoneEmailBody, buildMilestoneEmailSubject } from "./emailContent.js";
import { SmtpEmailSender, type EmailSender } from "../email/emailService.js";
import { loadSettings } from "./settings.js";

export interface RunDailyCheckOptions {
  // Defaults to today in Europe/London. Passing this explicitly is also
  // how preview-for-a-date and the diagnostic tool reuse this same
  // function without duplicating the milestone-matching logic.
  asOfDate?: string;
  emailSender?: EmailSender;
  // Preview mode: compute and report what *would* happen, but never
  // insert alert rows or send email. Used by the "preview upcoming
  // alerts" admin feature.
  dryRun?: boolean;
  // Only meaningful with dryRun - also return the actual list of matches
  // (not just counts), for the admin preview screen.
  collectMatches?: boolean;
}

export interface DaysAliveMatch {
  clientId: number;
  fullName: string;
  milestoneDays: number;
  milestoneDate: string;
  alertDate: string;
  ageOnMilestone: number;
}

export interface RunDailyCheckResult {
  jobRunId: number | null;
  runDate: string;
  featureEnabled: boolean;
  clientsChecked: number;
  clientsSkippedNoDob: number;
  alertsSent: number;
  alertsSkipped: number;
  alertsFailed: number;
  matches: DaysAliveMatch[];
}

// The daily "Days on the Planet" check. Runs once a day via the
// days-alive-daily GitHub Actions workflow (same pattern as backup.yml),
// but is also the exact function used for a manual admin rerun, a
// preview for a future date, and (with dryRun) the diagnostic tool - one
// implementation, not a parallel "preview" version that could drift from
// what actually sends.
export async function runDailyCheck(options: RunDailyCheckOptions = {}): Promise<RunDailyCheckResult> {
  const asOfDate = options.asOfDate ?? todayInLondon();
  const dryRun = options.dryRun ?? false;
  const collectMatches = options.collectMatches ?? false;
  const emailSender = options.emailSender ?? new SmtpEmailSender();

  const settings = await loadSettings();

  let jobRunId: number | null = null;
  if (!dryRun) {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO days_alive_job_runs (run_date) VALUES ($1) RETURNING id`,
      [asOfDate]
    );
    jobRunId = rows[0].id;
  }

  const result: RunDailyCheckResult = {
    jobRunId,
    runDate: asOfDate,
    featureEnabled: settings.enabled,
    clientsChecked: 0,
    clientsSkippedNoDob: 0,
    alertsSent: 0,
    alertsSkipped: 0,
    alertsFailed: 0,
    matches: [],
  };

  if (!settings.enabled) {
    if (jobRunId !== null) {
      await pool.query(`UPDATE days_alive_job_runs SET finished_at = now() WHERE id = $1`, [jobRunId]);
    }
    return result;
  }

  const { rows: milestoneRows } = await pool.query<{ days: number }>(
    `SELECT days FROM days_alive_milestones WHERE enabled = true ORDER BY days`
  );
  const milestones = milestoneRows.map((r) => r.days);

  const { rows: allClientRows } = await pool.query<{ id: number; first_names: string; surname: string; dob: unknown }>(
    `SELECT id, first_names, surname, dob FROM clients WHERE deleted_at IS NULL`
  );

  for (const client of allClientRows) {
    const dob = dateOnlyFromDb(client.dob);
    if (dob === null) {
      result.clientsSkippedNoDob++;
      continue;
    }

    result.clientsChecked++;

    try {
      if (!isValidDateString(dob)) {
        throw new Error(`Invalid date of birth: ${JSON.stringify(dob)}`);
      }

      for (const milestoneDays of milestones) {
        const milestoneDate = milestoneDateFor(dob, milestoneDays);
        const alertDate = alertDateFor(milestoneDate, settings.warningDaysBefore);
        if (alertDate !== asOfDate) continue;

        const age = ageOn(dob, milestoneDate);
        const fullName = `${client.first_names} ${client.surname}`;
        const sendCardByDate = addDays(milestoneDate, -settings.cardLeadDays);
        const emailInput = { fullName, milestoneDays, ageOnMilestone: age, milestoneDate, alertDate, sendCardByDate };
        const subject = buildMilestoneEmailSubject(emailInput);
        const recipient = settings.recipientEmail || process.env.DAYS_ALIVE_RECIPIENT || null;

        if (dryRun) {
          result.alertsSent++; // "would send" in preview terms
          if (collectMatches) {
            result.matches.push({
              clientId: client.id,
              fullName,
              milestoneDays,
              milestoneDate,
              alertDate,
              ageOnMilestone: age,
            });
          }
          continue;
        }

        const { rows: insertedRows } = await pool.query<{ id: number }>(
          `INSERT INTO days_alive_alerts
             (client_id, milestone_days, milestone_date, alert_date, alert_days_before,
              age_years_on_milestone, status, recipient, email_subject, job_run_id)
           VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9)
           ON CONFLICT (client_id, milestone_days, alert_days_before) DO NOTHING
           RETURNING id`,
          [client.id, milestoneDays, milestoneDate, alertDate, settings.warningDaysBefore, age, recipient, subject, jobRunId]
        );

        if (insertedRows.length === 0) {
          // A row already exists for this client+milestone+window - from
          // earlier today, or any prior day. The UNIQUE constraint (not
          // just this check) is what actually guarantees no duplicate
          // send; this is just how we notice and count it.
          result.alertsSkipped++;
          continue;
        }
        const alertId = insertedRows[0].id;

        if (!recipient) {
          await pool.query(`UPDATE days_alive_alerts SET status = 'failed', error_message = $2 WHERE id = $1`, [
            alertId,
            "No recipient configured (set a recipient email in Days Alive settings, or the DAYS_ALIVE_RECIPIENT env var)",
          ]);
          result.alertsFailed++;
          continue;
        }

        try {
          const body = buildMilestoneEmailBody(emailInput);
          await emailSender.send({ to: recipient, subject, body });
          await pool.query(`UPDATE days_alive_alerts SET status = 'sent', sent_at = now() WHERE id = $1`, [alertId]);
          result.alertsSent++;
        } catch (err) {
          await pool.query(`UPDATE days_alive_alerts SET status = 'failed', error_message = $2 WHERE id = $1`, [
            alertId,
            err instanceof Error ? err.message : String(err),
          ]);
          result.alertsFailed++;
        }
      }
    } catch (err) {
      // One client's failure (a corrupt dob that somehow reached the
      // clients table outside the app's own validated routes, etc.)
      // must never stop the rest of the run.
      result.alertsFailed++;
      console.error(`Days Alive: skipped client ${client.id} - ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (jobRunId !== null) {
    await pool.query(
      `UPDATE days_alive_job_runs
          SET finished_at = now(), clients_checked = $2, alerts_sent = $3, alerts_skipped = $4, alerts_failed = $5
        WHERE id = $1`,
      [jobRunId, result.clientsChecked, result.alertsSent, result.alertsSkipped, result.alertsFailed]
    );
  }

  console.log(
    `Days Alive run for ${asOfDate}: ${result.clientsChecked} clients checked ` +
      `(${result.clientsSkippedNoDob} skipped - no DoB), ${result.alertsSent} sent, ` +
      `${result.alertsSkipped} already sent (skipped), ${result.alertsFailed} failed.`
  );

  return result;
}

// CLI entrypoint for the scheduled workflow: `tsx src/daysAlive/runDailyCheck.ts`.
// Only runs the module-load side effect when executed directly, not when
// imported by routes/tests - the standard ESM "am I the entrypoint" check.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  runDailyCheck()
    .then(async (result) => {
      console.log(JSON.stringify(result, null, 2));
      await pool.end();
      process.exitCode = result.alertsFailed > 0 ? 1 : 0;
    })
    .catch(async (err) => {
      console.error(err);
      await pool.end();
      process.exitCode = 1;
    });
}
