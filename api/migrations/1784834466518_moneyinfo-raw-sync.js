/* eslint-disable camelcase */

export const shorthands = undefined;

export const up = (pgm) => {
  // ---------------------------------------------------------------------
  // Raw moneyinfo sync bundles - everything the API returned for a client,
  // untouched, one row per sync run. This is where thread messages (the
  // after-call actions) land for the LATER Phase 2 extraction step. It is
  // deliberately outside the Living Document spine: nothing here is ever
  // read by soft_facts/points/meeting_notes, and the sync job never writes
  // to those tables. History is kept (never overwritten) so a bad sync run
  // can be diagnosed against what came before it.
  // ---------------------------------------------------------------------
  pgm.createTable('moneyinfo_raw_sync', {
    id: 'id',
    client_id: { type: 'integer', notNull: true, references: 'clients', onDelete: 'CASCADE' },
    moneyinfo_client_id: { type: 'text', notNull: true },
    raw: { type: 'jsonb', notNull: true },
    synced_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('moneyinfo_raw_sync', 'client_id');
  pgm.createIndex('moneyinfo_raw_sync', 'moneyinfo_client_id');
};

export const down = (pgm) => {
  pgm.dropTable('moneyinfo_raw_sync');
};
