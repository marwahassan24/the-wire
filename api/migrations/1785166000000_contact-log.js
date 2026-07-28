/* eslint-disable camelcase */

export const shorthands = undefined;

export const up = (pgm) => {
  // ---------------------------------------------------------------------
  // Ordinary contact - a call, an email, a quick check-in - as opposed to
  // the formal reviews the rest of the schema already tracks. Without
  // this, "who haven't we spoken to in six months" has no answer. Same
  // soft-delete + audit conventions as every other spine table.
  // ---------------------------------------------------------------------
  pgm.createTable('contact_log', {
    id: 'id',
    client_id: { type: 'integer', notNull: true, references: 'clients' },
    contact_date: { type: 'date', notNull: true },
    type: {
      type: 'text',
      notNull: true,
      check: "type IN ('call', 'email', 'meeting', 'other')",
    },
    staff_id: { type: 'integer', notNull: true, references: 'users' },
    note: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    deleted_at: { type: 'timestamptz' },
  });
  pgm.createIndex('contact_log', 'client_id');
  pgm.createIndex('contact_log', 'contact_date');
};

export const down = (pgm) => {
  pgm.dropTable('contact_log');
};
