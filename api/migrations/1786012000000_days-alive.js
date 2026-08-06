/* eslint-disable camelcase */

export const shorthands = undefined;

// ---------------------------------------------------------------------
// "Days on the Planet" milestone alerts - replaces the old Excel/Power
// Automate version. Everything is computed from clients.dob (already a
// date-only column) at read time; nothing here stores a precomputed
// days-alive figure. See api/src/daysAlive/calc.ts for the arithmetic
// and api/src/daysAlive/runDailyCheck.ts for the job that uses these
// tables.
// ---------------------------------------------------------------------
export const up = (pgm) => {
  pgm.createTable('days_alive_milestones', {
    id: 'id',
    days: { type: 'integer', notNull: true, unique: true },
    enabled: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // Single-row settings, same "one row, PATCH it" shape as nothing else
  // in this app yet - the closest existing thing (ops.ts's SLA
  // thresholds) is query-string-only and never persisted, which doesn't
  // fit a feature admins need to actually turn on/off and edit.
  pgm.createTable('days_alive_settings', {
    id: 'id',
    enabled: { type: 'boolean', notNull: true, default: true },
    warning_days_before: { type: 'integer', notNull: true, default: 30 },
    card_lead_days: { type: 'integer', notNull: true, default: 5 },
    // Admin-set recipient; the job falls back to the DAYS_ALIVE_RECIPIENT
    // env var if this is null (see runDailyCheck.ts). Never both -
    // whichever resolves first wins, and which one fired is recorded on
    // each alert row's `recipient` column.
    recipient_email: { type: 'text' },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('days_alive_job_runs', {
    id: 'id',
    run_date: { type: 'date', notNull: true },
    started_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    finished_at: { type: 'timestamptz' },
    clients_checked: { type: 'integer', notNull: true, default: 0 },
    alerts_sent: { type: 'integer', notNull: true, default: 0 },
    alerts_skipped: { type: 'integer', notNull: true, default: 0 },
    alerts_failed: { type: 'integer', notNull: true, default: 0 },
  });
  pgm.createIndex('days_alive_job_runs', 'run_date');

  // The permanent audit table - one row per client+milestone+warning-
  // window, ever. The UNIQUE constraint is the real (DB-level, not just
  // in-memory) idempotency guard: a rerun on the same day, or any day,
  // can never produce a second row for the same key, so it can never
  // send the same alert twice.
  pgm.createTable('days_alive_alerts', {
    id: 'id',
    client_id: { type: 'integer', notNull: true, references: 'clients' },
    milestone_days: { type: 'integer', notNull: true },
    milestone_date: { type: 'date', notNull: true },
    alert_date: { type: 'date', notNull: true },
    // Captured at creation time, not a live read of settings - so a
    // later change to the default warning period doesn't rewrite the
    // meaning of historical rows.
    alert_days_before: { type: 'integer', notNull: true },
    age_years_on_milestone: { type: 'integer', notNull: true },
    status: {
      type: 'text',
      notNull: true,
      check: "status IN ('pending', 'sent', 'failed', 'skipped')",
    },
    recipient: { type: 'text' },
    email_subject: { type: 'text' },
    error_message: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    sent_at: { type: 'timestamptz' },
    job_run_id: { type: 'integer', references: 'days_alive_job_runs' },
  });
  pgm.addConstraint('days_alive_alerts', 'days_alive_alerts_client_milestone_window_unique', {
    unique: ['client_id', 'milestone_days', 'alert_days_before'],
  });
  pgm.createIndex('days_alive_alerts', 'client_id');
  pgm.createIndex('days_alive_alerts', 'status');
  pgm.createIndex('days_alive_alerts', 'alert_date');
  pgm.createIndex('days_alive_alerts', 'milestone_days');

  // The 40 milestones from the original spreadsheet. 9970 is
  // deliberately excluded - it was only ever a temporary test value in
  // the old Power Automate list, not a real milestone.
  const MILESTONES = [
    3000, 3333, 4000, 4444, 5000, 5555, 6666, 7500, 7777, 8000, 8888, 9000, 9999, 10000, 10001,
    11111, 12000, 12121, 12345, 12500, 13131, 13579, 14999, 15000, 15551, 17500, 18000, 19999,
    20000, 20020, 21111, 22222, 22500, 23456, 24242, 24999, 25000, 25252, 27500, 30000,
  ];
  const values = MILESTONES.map((d) => `(${d}, true)`).join(', ');
  pgm.sql(`INSERT INTO days_alive_milestones (days, enabled) VALUES ${values}`);

  pgm.sql(`INSERT INTO days_alive_settings (enabled, warning_days_before, card_lead_days) VALUES (true, 30, 5)`);
};

export const down = (pgm) => {
  pgm.dropTable('days_alive_alerts');
  pgm.dropTable('days_alive_job_runs');
  pgm.dropTable('days_alive_settings');
  pgm.dropTable('days_alive_milestones');
};
