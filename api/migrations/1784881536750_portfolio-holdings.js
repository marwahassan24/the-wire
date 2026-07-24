/* eslint-disable camelcase */

export const shorthands = undefined;

export const up = (pgm) => {
  // ---------------------------------------------------------------------
  // Structured portfolio detail from moneyinfo: one row per plan,
  // investment or account, so the front end can chart asset allocation
  // and break down where money sits, instead of only having a free-text
  // summary line. Entirely sync-authored - there is no adviser-editable
  // path onto this table, so each sync run replaces a client's rows
  // wholesale (see syncJob.ts) rather than appending. portfolio_summary
  // (the free-text spine section) is untouched by this table and keeps
  // working exactly as before.
  // ---------------------------------------------------------------------
  pgm.createTable('portfolio_holdings', {
    id: 'id',
    client_id: { type: 'integer', notNull: true, references: 'clients', onDelete: 'CASCADE' },
    moneyinfo_holding_id: { type: 'text' },
    source: { type: 'text', notNull: true },
    provider: { type: 'text' },
    plan_type: { type: 'text' },
    holding_name: { type: 'text' },
    asset_class: { type: 'text' },
    value: { type: 'numeric(14,2)' },
    currency: { type: 'text', notNull: true, default: 'GBP' },
    as_of_date: { type: 'date' },
    raw: { type: 'jsonb', notNull: true },
    synced_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('portfolio_holdings', 'portfolio_holdings_source_check', {
    check: "source IN ('plan', 'investment', 'account')",
  });
  pgm.createIndex('portfolio_holdings', 'client_id');
  pgm.createIndex('portfolio_holdings', 'asset_class');
};

export const down = (pgm) => {
  pgm.dropTable('portfolio_holdings');
};
