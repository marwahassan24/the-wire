/* eslint-disable camelcase */

export const shorthands = undefined;

export const up = (pgm) => {
  // ---------------------------------------------------------------------
  // File uploads attached to a client, shown in their Living Document.
  // The binary bytes live behind the FileStorage abstraction (local disk
  // for now - see api/src/storage/); this table only ever stores the
  // metadata and a storage_key pointing at those bytes, same split as
  // moneyinfo_raw_sync keeping the raw blob separate from the row that
  // describes it. Soft-deleted like everything else in the app - deleting
  // hides an attachment from the list and blocks download, but neither
  // the row nor the underlying file is destroyed.
  // ---------------------------------------------------------------------
  pgm.createTable('attachments', {
    id: 'id',
    client_id: { type: 'integer', notNull: true, references: 'clients' },
    filename: { type: 'text', notNull: true },
    storage_key: { type: 'text', notNull: true },
    content_type: { type: 'text', notNull: true },
    size_bytes: { type: 'integer', notNull: true },
    note: { type: 'text' },
    uploaded_by: { type: 'integer', notNull: true, references: 'users' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    deleted_at: { type: 'timestamptz' },
  });
  pgm.createIndex('attachments', 'client_id');
};

export const down = (pgm) => {
  pgm.dropTable('attachments');
};
