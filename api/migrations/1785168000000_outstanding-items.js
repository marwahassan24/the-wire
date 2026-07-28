/* eslint-disable camelcase */

export const shorthands = undefined;

export const up = (pgm) => {
  // ---------------------------------------------------------------------
  // Outstanding items - Letters of Authority, signatures, ISA/pension
  // transfers - as one record with a type field rather than three
  // separate features. A new type is a CHECK-constraint value, not a new
  // table/route/component. Same soft-delete + audit conventions as
  // everything else in the spine.
  // ---------------------------------------------------------------------
  pgm.createTable('outstanding_items', {
    id: 'id',
    client_id: { type: 'integer', notNull: true, references: 'clients' },
    type: {
      type: 'text',
      notNull: true,
      check: "type IN ('loa', 'signature', 'transfer')",
    },
    description: { type: 'text', notNull: true },
    owner_id: { type: 'integer', notNull: true, references: 'users' },
    raised_at: { type: 'date', notNull: true, default: pgm.func('current_date') },
    status: {
      type: 'text',
      notNull: true,
      default: 'outstanding',
      check: "status IN ('outstanding', 'received', 'cancelled')",
    },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    deleted_at: { type: 'timestamptz' },
  });
  pgm.createIndex('outstanding_items', 'client_id');
  pgm.createIndex('outstanding_items', 'type');
  pgm.createIndex('outstanding_items', 'status');

  // Chasing is loggable more than once - an append-only event log (same
  // shape as case_events), not a single "last chased" column, so how many
  // times and when are both visible.
  pgm.createTable('outstanding_item_chases', {
    id: 'id',
    outstanding_item_id: { type: 'integer', notNull: true, references: 'outstanding_items' },
    chased_at: { type: 'date', notNull: true, default: pgm.func('current_date') },
    chased_by: { type: 'integer', notNull: true, references: 'users' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('outstanding_item_chases', 'outstanding_item_id');
};

export const down = (pgm) => {
  pgm.dropTable('outstanding_item_chases');
  pgm.dropTable('outstanding_items');
};
