import { pool } from "../db.js";

export interface DaysAliveSettings {
  id: number;
  enabled: boolean;
  warningDaysBefore: number;
  cardLeadDays: number;
  recipientEmail: string | null;
}

// The migration always seeds exactly one row, so this is really just
// belt-and-braces - single-row settings, same shape the rest of the app
// would reach for if it had a persisted settings concept anywhere (it
// doesn't yet; ops.ts's SLA thresholds are query-string-only).
const DEFAULTS: Omit<DaysAliveSettings, "id"> = {
  enabled: true,
  warningDaysBefore: 30,
  cardLeadDays: 5,
  recipientEmail: null,
};

export async function loadSettings(): Promise<DaysAliveSettings> {
  const { rows } = await pool.query(
    `SELECT id, enabled, warning_days_before, card_lead_days, recipient_email
       FROM days_alive_settings ORDER BY id LIMIT 1`
  );
  if (rows.length === 0) return { id: 0, ...DEFAULTS };
  const row = rows[0];
  return {
    id: row.id,
    enabled: row.enabled,
    warningDaysBefore: row.warning_days_before,
    cardLeadDays: row.card_lead_days,
    recipientEmail: row.recipient_email,
  };
}
