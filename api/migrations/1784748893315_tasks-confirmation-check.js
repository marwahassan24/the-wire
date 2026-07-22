/* eslint-disable camelcase */

export const shorthands = undefined;

// Mirrors the meeting_notes approval-consistency check: confirmed_by and
// confirmed_at must be set together, and only once a task has actually
// left awaiting_sense_check. Nothing counts as real work — 'confirmed' or
// 'done' — without that pair being populated, so this is a DB-level
// guarantee of the sense-check gate, not just an API-layer convention.
export const up = (pgm) => {
  pgm.addConstraint('tasks', 'tasks_confirmation_consistency_check', {
    check: "(status = 'awaiting_sense_check') = (confirmed_by IS NULL AND confirmed_at IS NULL)",
  });
};

export const down = (pgm) => {
  pgm.dropConstraint('tasks', 'tasks_confirmation_consistency_check');
};
