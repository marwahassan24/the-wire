import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../db.js";
import { addDays, ageOn, milestoneDateFor } from "./calc.js";
import type { EmailSender, EmailMessage } from "../email/emailService.js";
import { runDailyCheck } from "./runDailyCheck.js";

// A fixed date, unrelated to whatever day the test suite actually runs
// on - every fixture below is built backwards from this so the whole
// file is deterministic regardless of the real calendar date.
const FIXED_DATE = "2026-01-15";
const WARNING_DAYS = 30;

// Dedicated test-only milestones, well clear of the 40 real ones from
// the migration seed, so these tests never interact with production
// milestone data.
const TEST_MILESTONE_A = 31001;
const TEST_MILESTONE_B = 31002;
const TEST_MILESTONE_DISABLED = 31003;

let adviserId: number;
const clientIds: number[] = [];

class FakeEmailSender implements EmailSender {
  sent: EmailMessage[] = [];
  failFor: Set<string>;
  constructor(failFor: string[] = []) {
    this.failFor = new Set(failFor);
  }
  async send(message: EmailMessage): Promise<void> {
    if (this.failFor.has(message.to)) {
      throw new Error(`Simulated SMTP failure sending to ${message.to}`);
    }
    this.sent.push(message);
  }
}

function dobForMilestoneOnAlertDate(milestoneDays: number, alertDate: string): string {
  const milestoneDate = addDays(alertDate, WARNING_DAYS);
  // milestoneDate = dob + milestoneDays, so dob = milestoneDate - milestoneDays
  return addDays(milestoneDate, -milestoneDays);
}

async function createTestClient(dob: string | null): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO clients (first_names, surname, status, adviser_id, cm_id, review_cycle, dob)
     VALUES ('Days Alive Test', 'TESTCLIENT', 'Working', $1, $1, 'Annual', $2) RETURNING id`,
    [adviserId, dob]
  );
  clientIds.push(rows[0].id);
  return rows[0].id;
}

before(async () => {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, 'x', 'Days Alive Test Adviser', 'adviser') RETURNING id`,
    [`days-alive-test-${Date.now()}@tcfp.test`]
  );
  adviserId = rows[0].id;

  await pool.query(
    `INSERT INTO days_alive_milestones (days, enabled) VALUES ($1, true), ($2, true), ($3, false)`,
    [TEST_MILESTONE_A, TEST_MILESTONE_B, TEST_MILESTONE_DISABLED]
  );
});

after(async () => {
  await pool.query(`DELETE FROM days_alive_alerts WHERE client_id = ANY($1::int[])`, [clientIds]);
  await pool.query(`DELETE FROM days_alive_job_runs WHERE run_date = $1`, [FIXED_DATE]);
  await pool.query(`DELETE FROM days_alive_milestones WHERE days = ANY($1::int[])`, [
    [TEST_MILESTONE_A, TEST_MILESTONE_B, TEST_MILESTONE_DISABLED],
  ]);
  await pool.query(`DELETE FROM clients WHERE id = ANY($1::int[])`, [clientIds]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [adviserId]);
  await pool.query(`UPDATE days_alive_settings SET recipient_email = NULL`);
  await pool.end();
});

async function setRecipient(email: string | null) {
  await pool.query(`UPDATE days_alive_settings SET recipient_email = $1`, [email]);
}

test("a matching client gets a sent alert, with the correct age calculated on the milestone date", async () => {
  const dob = dobForMilestoneOnAlertDate(TEST_MILESTONE_A, FIXED_DATE);
  const clientId = await createTestClient(dob);
  const sender = new FakeEmailSender();
  await setRecipient("staff@tcfp.test");

  const result = await runDailyCheck({ asOfDate: FIXED_DATE, emailSender: sender });

  assert.equal(result.alertsFailed, 0);
  assert.ok(result.alertsSent >= 1);
  assert.equal(sender.sent.length >= 1, true);

  const { rows } = await pool.query(
    `SELECT * FROM days_alive_alerts WHERE client_id = $1 AND milestone_days = $2`,
    [clientId, TEST_MILESTONE_A]
  );
  assert.equal(rows.length, 1);
  const alert = rows[0];
  assert.equal(alert.status, "sent");
  assert.ok(alert.sent_at);
  const milestoneDate = milestoneDateFor(dob, TEST_MILESTONE_A);
  assert.equal(alert.age_years_on_milestone, ageOn(dob, milestoneDate));
  assert.equal(alert.recipient, "staff@tcfp.test");
  assert.match(alert.email_subject, /31,001 days/);
});

test("rerunning the same day does not send a duplicate - the DB unique constraint is the real guard", async () => {
  const dob = dobForMilestoneOnAlertDate(TEST_MILESTONE_A, FIXED_DATE);
  const clientId = await createTestClient(dob);
  const sender = new FakeEmailSender();
  await setRecipient("staff@tcfp.test");

  await runDailyCheck({ asOfDate: FIXED_DATE, emailSender: sender });
  const secondRun = await runDailyCheck({ asOfDate: FIXED_DATE, emailSender: sender });

  const { rows } = await pool.query(
    `SELECT status FROM days_alive_alerts WHERE client_id = $1 AND milestone_days = $2`,
    [clientId, TEST_MILESTONE_A]
  );
  assert.equal(rows.length, 1, "exactly one alert row must exist, never two");
  assert.equal(rows[0].status, "sent");
  assert.ok(secondRun.alertsSkipped >= 1, "the rerun should report the duplicate as skipped");
  assert.equal(sender.sent.length, 1, "the email must only have actually been sent once");
});

test("a disabled milestone produces no alert", async () => {
  const dob = dobForMilestoneOnAlertDate(TEST_MILESTONE_DISABLED, FIXED_DATE);
  const clientId = await createTestClient(dob);
  await setRecipient("staff@tcfp.test");

  await runDailyCheck({ asOfDate: FIXED_DATE, emailSender: new FakeEmailSender() });

  const { rows } = await pool.query(`SELECT * FROM days_alive_alerts WHERE client_id = $1`, [clientId]);
  assert.equal(rows.length, 0);
});

test("a soft-deleted (disabled) client is excluded", async () => {
  const dob = dobForMilestoneOnAlertDate(TEST_MILESTONE_B, FIXED_DATE);
  const clientId = await createTestClient(dob);
  await pool.query(`UPDATE clients SET deleted_at = now() WHERE id = $1`, [clientId]);
  await setRecipient("staff@tcfp.test");

  await runDailyCheck({ asOfDate: FIXED_DATE, emailSender: new FakeEmailSender() });

  const { rows } = await pool.query(`SELECT * FROM days_alive_alerts WHERE client_id = $1`, [clientId]);
  assert.equal(rows.length, 0);

  await pool.query(`UPDATE clients SET deleted_at = NULL WHERE id = $1`, [clientId]);
});

test("a client with no date of birth is skipped, not counted as a failure, and doesn't stop the run", async () => {
  const noDobClient = await createTestClient(null);
  const dob = dobForMilestoneOnAlertDate(TEST_MILESTONE_A, FIXED_DATE);
  const goodClient = await createTestClient(dob);
  await setRecipient("staff@tcfp.test");

  const result = await runDailyCheck({ asOfDate: FIXED_DATE, emailSender: new FakeEmailSender() });

  assert.ok(result.clientsSkippedNoDob >= 1);
  const { rows: noDobRows } = await pool.query(`SELECT * FROM days_alive_alerts WHERE client_id = $1`, [
    noDobClient,
  ]);
  assert.equal(noDobRows.length, 0);
  const { rows: goodRows } = await pool.query(
    `SELECT status FROM days_alive_alerts WHERE client_id = $1 AND milestone_days = $2`,
    [goodClient, TEST_MILESTONE_A]
  );
  assert.equal(goodRows.length, 1);
  assert.equal(goodRows[0].status, "sent");
});

// "Invalid date of birth" (as opposed to missing) can't actually be
// inserted into clients.dob - it's a Postgres `date` column, so the
// database itself rejects a malformed date at insert time. That
// validation is exercised directly in calc.test.ts (isValidDateString,
// daysAliveOn/milestoneDateFor throwing on bad input) - what matters
// here is that the per-client try/catch in the job would still isolate
// such a failure without stopping the run, which the email-failure test
// below already demonstrates for a different failure mode.

test("no recipient configured records a clear failure instead of pretending to send", async () => {
  const dob = dobForMilestoneOnAlertDate(TEST_MILESTONE_A, FIXED_DATE);
  const clientId = await createTestClient(dob);
  await setRecipient(null);
  const originalEnv = process.env.DAYS_ALIVE_RECIPIENT;
  delete process.env.DAYS_ALIVE_RECIPIENT;

  try {
    await runDailyCheck({ asOfDate: FIXED_DATE, emailSender: new FakeEmailSender() });
  } finally {
    if (originalEnv !== undefined) process.env.DAYS_ALIVE_RECIPIENT = originalEnv;
  }

  const { rows } = await pool.query(
    `SELECT status, error_message FROM days_alive_alerts WHERE client_id = $1 AND milestone_days = $2`,
    [clientId, TEST_MILESTONE_A]
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "failed");
  assert.match(rows[0].error_message, /no recipient configured/i);
});

test("an email-send failure is recorded on that alert without stopping the run, and other clients still succeed", async () => {
  const dobFail = dobForMilestoneOnAlertDate(TEST_MILESTONE_A, FIXED_DATE);
  const failClient = await createTestClient(dobFail);
  const dobOk = dobForMilestoneOnAlertDate(TEST_MILESTONE_B, FIXED_DATE);
  const okClient = await createTestClient(dobOk);
  await setRecipient("staff@tcfp.test");

  // Both clients share the same recipient, so make the sender fail only
  // when the subject mentions the milestone we want to fail.
  class SelectiveFailSender implements EmailSender {
    async send(message: EmailMessage): Promise<void> {
      if (message.subject.includes("31,001")) throw new Error("Simulated SMTP timeout");
    }
  }

  const result = await runDailyCheck({ asOfDate: FIXED_DATE, emailSender: new SelectiveFailSender() });

  assert.ok(result.alertsFailed >= 1);
  assert.ok(result.alertsSent >= 1);

  const { rows: failRows } = await pool.query(
    `SELECT status, error_message FROM days_alive_alerts WHERE client_id = $1 AND milestone_days = $2`,
    [failClient, TEST_MILESTONE_A]
  );
  assert.equal(failRows[0].status, "failed");
  assert.match(failRows[0].error_message, /Simulated SMTP timeout/);

  const { rows: okRows } = await pool.query(
    `SELECT status FROM days_alive_alerts WHERE client_id = $1 AND milestone_days = $2`,
    [okClient, TEST_MILESTONE_B]
  );
  assert.equal(okRows[0].status, "sent");
});

test("previewing a date (dry run) reports matches without writing any alert rows or sending email", async () => {
  const dob = dobForMilestoneOnAlertDate(TEST_MILESTONE_A, FIXED_DATE);
  const clientId = await createTestClient(dob);
  const sender = new FakeEmailSender();
  await setRecipient("staff@tcfp.test");

  const { rows: beforeRuns } = await pool.query(`SELECT count(*)::int AS n FROM days_alive_job_runs`);

  const preview = await runDailyCheck({
    asOfDate: FIXED_DATE,
    emailSender: sender,
    dryRun: true,
    collectMatches: true,
  });

  const { rows: afterRuns } = await pool.query(`SELECT count(*)::int AS n FROM days_alive_job_runs`);
  assert.equal(beforeRuns[0].n, afterRuns[0].n, "a dry run must not create a job_runs row");

  const { rows: alerts } = await pool.query(`SELECT * FROM days_alive_alerts WHERE client_id = $1`, [clientId]);
  assert.equal(alerts.length, 0, "a dry run must not write any alert rows");
  assert.equal(sender.sent.length, 0, "a dry run must not actually send email");

  assert.ok(preview.matches.some((m) => m.clientId === clientId && m.milestoneDays === TEST_MILESTONE_A));
});

test("previewing a future date works the same way as a historical one - it's just a parameter", async () => {
  const futureAlertDate = "2027-06-01";
  const dob = dobForMilestoneOnAlertDate(TEST_MILESTONE_B, futureAlertDate);
  const clientId = await createTestClient(dob);
  await setRecipient("staff@tcfp.test");

  const preview = await runDailyCheck({
    asOfDate: futureAlertDate,
    dryRun: true,
    collectMatches: true,
    emailSender: new FakeEmailSender(),
  });

  assert.ok(preview.matches.some((m) => m.clientId === clientId && m.milestoneDays === TEST_MILESTONE_B));
});
