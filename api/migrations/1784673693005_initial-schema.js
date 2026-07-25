/* eslint-disable camelcase */

export const shorthands = undefined;

export const up = (pgm) => {
  // ---------------------------------------------------------------------
  // Who uses The Wire
  // ---------------------------------------------------------------------
  pgm.createTable('users', {
    id: 'id',
    email: { type: 'text', notNull: true, unique: true },
    password_hash: { type: 'text', notNull: true },
    name: { type: 'text', notNull: true },
    role: {
      type: 'text',
      notNull: true,
      check: "role IN ('adviser', 'client_manager', 'admin')",
    },
    active: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    last_login_at: { type: 'timestamptz' },
  });

  pgm.createTable('sessions', {
    id: 'id',
    user_id: { type: 'integer', notNull: true, references: 'users', onDelete: 'CASCADE' },
    expires_at: { type: 'timestamptz', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('sessions', 'user_id');
  pgm.createIndex('sessions', 'expires_at');

  // ---------------------------------------------------------------------
  // The client families — the spine everything else hangs off
  // ---------------------------------------------------------------------
  pgm.createTable('clients', {
    id: 'id',
    // Links to the moneyinfo sync. Unique so the sync can upsert by it
    // without creating duplicate client rows.
    moneyinfo_client_id: { type: 'text', unique: true },
    first_names: { type: 'text', notNull: true },
    surname: { type: 'text', notNull: true },
    dob: { type: 'date' },
    dob_2: { type: 'date' },
    email: { type: 'text' },
    phone: { type: 'text' },
    status: {
      type: 'text',
      notNull: true,
      check: "status IN ('Working', 'Retired')",
    },
    adviser_id: { type: 'integer', notNull: true, references: 'users' },
    cm_id: { type: 'integer', notNull: true, references: 'users' },
    review_cycle: {
      type: 'text',
      notNull: true,
      check: "review_cycle IN ('Annual', 'Interim', 'Ad hoc')",
    },
    next_review_date: { type: 'date' },
    next_review_type: {
      type: 'text',
      check: "next_review_type IN ('Annual', 'Interim', 'Ad hoc')",
    },
    last_review_date: { type: 'date' },
    // Optimistic concurrency — the API rejects a PATCH whose version is stale.
    version: { type: 'integer', notNull: true, default: 1 },
    // Per-client counter backing points.number: incremented atomically so two
    // advisers raising a point at once can never collide on the same number.
    next_point_number: { type: 'integer', notNull: true, default: 1 },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    deleted_at: { type: 'timestamptz' },
  });
  pgm.createIndex('clients', 'adviser_id');
  pgm.createIndex('clients', 'cm_id');
  pgm.createIndex('clients', 'status');
  pgm.createIndex('clients', 'next_review_date');

  // ---------------------------------------------------------------------
  // Section 1 — Soft facts
  // ---------------------------------------------------------------------
  pgm.createTable('soft_facts', {
    id: 'id',
    client_id: { type: 'integer', notNull: true, references: 'clients' },
    fact_date: { type: 'date', notNull: true },
    text: { type: 'text', notNull: true },
    author_id: { type: 'integer', notNull: true, references: 'users' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    deleted_at: { type: 'timestamptz' },
  });
  pgm.createIndex('soft_facts', 'client_id');

  // ---------------------------------------------------------------------
  // Section 2 — Points to note / discuss. Carry-forward behaviour is the
  // load-bearing part: a point can't leave 'open' without a resolution
  // note, and numbers are per-client, sequential, and never reused.
  // ---------------------------------------------------------------------
  pgm.createTable('points', {
    id: 'id',
    client_id: { type: 'integer', notNull: true, references: 'clients' },
    number: { type: 'integer', notNull: true },
    text: { type: 'text', notNull: true },
    status: {
      type: 'text',
      notNull: true,
      default: 'open',
      check: "status IN ('open', 'carried', 'resolved')",
    },
    resolution_note: { type: 'text' },
    raised_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    raised_context: { type: 'text' },
    resolved_at: { type: 'timestamptz' },
    resolved_by: { type: 'integer', references: 'users' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    deleted_at: { type: 'timestamptz' },
  });
  pgm.addConstraint('points', 'points_client_id_number_unique', {
    unique: ['client_id', 'number'],
  });
  pgm.addConstraint('points', 'points_resolution_required_check', {
    check: "status = 'open' OR resolution_note IS NOT NULL",
  });
  pgm.createIndex('points', 'client_id');
  pgm.createIndex('points', 'status');

  // ---------------------------------------------------------------------
  // Section 3 — Meeting Note. Only 'approved' is client-visible.
  // ---------------------------------------------------------------------
  pgm.createTable('meeting_notes', {
    id: 'id',
    client_id: { type: 'integer', notNull: true, references: 'clients' },
    meeting_date: { type: 'date', notNull: true },
    meeting_type: {
      type: 'text',
      notNull: true,
      check: "meeting_type IN ('Annual', 'Interim', 'Ad hoc')",
    },
    body: { type: 'text', notNull: true },
    author_id: { type: 'integer', notNull: true, references: 'users' },
    status: {
      type: 'text',
      notNull: true,
      default: 'draft',
      check: "status IN ('draft', 'approved')",
    },
    approved_by: { type: 'integer', references: 'users' },
    approved_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    deleted_at: { type: 'timestamptz' },
  });
  pgm.addConstraint('meeting_notes', 'meeting_notes_approval_consistency_check', {
    check: "(status = 'approved') = (approved_by IS NOT NULL AND approved_at IS NOT NULL)",
  });
  pgm.createIndex('meeting_notes', 'client_id');

  // ---------------------------------------------------------------------
  // Section 4 — Portfolio detail
  // ---------------------------------------------------------------------
  pgm.createTable('portfolio_summary', {
    client_id: { type: 'integer', primaryKey: true, references: 'clients' },
    summary: { type: 'text', notNull: true, default: '' },
    updated_by: { type: 'integer', references: 'users' },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('portfolio_log', {
    id: 'id',
    client_id: { type: 'integer', notNull: true, references: 'clients' },
    entry_date: { type: 'date', notNull: true },
    text: { type: 'text', notNull: true },
    author_id: { type: 'integer', notNull: true, references: 'users' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    deleted_at: { type: 'timestamptz' },
  });
  pgm.createIndex('portfolio_log', 'client_id');

  // ---------------------------------------------------------------------
  // Tasks — everything auto-created lands awaiting a human sense-check.
  // ---------------------------------------------------------------------
  pgm.createTable('tasks', {
    id: 'id',
    client_id: { type: 'integer', notNull: true, references: 'clients' },
    text: { type: 'text', notNull: true },
    owner_id: { type: 'integer', notNull: true, references: 'users' },
    due_date: { type: 'date' },
    status: {
      type: 'text',
      notNull: true,
      default: 'awaiting_sense_check',
      check: "status IN ('awaiting_sense_check', 'confirmed', 'done')",
    },
    source: {
      type: 'text',
      notNull: true,
      check: "source IN ('manual', 'meeting_note', 'sync')",
    },
    confirmed_by: { type: 'integer', references: 'users' },
    confirmed_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    deleted_at: { type: 'timestamptz' },
  });
  pgm.createIndex('tasks', 'client_id');
  pgm.createIndex('tasks', 'owner_id');
  pgm.createIndex('tasks', 'status');
  pgm.createIndex('tasks', 'due_date');

  // ---------------------------------------------------------------------
  // Case pipeline
  // ---------------------------------------------------------------------
  pgm.createTable('cases', {
    id: 'id',
    client_id: { type: 'integer', notNull: true, references: 'clients' },
    title: { type: 'text', notNull: true },
    stage: {
      type: 'text',
      notNull: true,
      default: 'Fact Find',
      check:
        "stage IN ('Fact Find', 'Research', 'Recommendation', 'Suitability Report', 'Compliance Review', 'Client Approval', 'Submission', 'Provider Processing', 'Completed')",
    },
    waiting_on: {
      type: 'text',
      check: "waiting_on IN ('us', 'client', 'provider', 'third_party')",
    },
    owner_id: { type: 'integer', references: 'users' },
    opened_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    stage_updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    closed_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    deleted_at: { type: 'timestamptz' },
  });
  pgm.createIndex('cases', 'client_id');
  pgm.createIndex('cases', 'stage');
  pgm.createIndex('cases', 'waiting_on');
  pgm.createIndex('cases', 'owner_id');

  pgm.createTable('case_events', {
    id: 'id',
    case_id: { type: 'integer', notNull: true, references: 'cases' },
    from_stage: { type: 'text' },
    to_stage: { type: 'text', notNull: true },
    note: { type: 'text' },
    user_id: { type: 'integer', notNull: true, references: 'users' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('case_events', 'case_id');

  // ---------------------------------------------------------------------
  // Everything — who, what, when, old value, new value
  // ---------------------------------------------------------------------
  pgm.createTable('audit_log', {
    id: { type: 'bigserial', primaryKey: true },
    user_id: { type: 'integer', references: 'users' },
    entity_type: { type: 'text', notNull: true },
    entity_id: { type: 'integer', notNull: true },
    action: { type: 'text', notNull: true },
    before: { type: 'jsonb' },
    after: { type: 'jsonb' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('audit_log', ['entity_type', 'entity_id']);
  pgm.createIndex('audit_log', 'user_id');
  pgm.createIndex('audit_log', 'created_at');
};

export const down = (pgm) => {
  pgm.dropTable('audit_log');
  pgm.dropTable('case_events');
  pgm.dropTable('cases');
  pgm.dropTable('tasks');
  pgm.dropTable('portfolio_log');
  pgm.dropTable('portfolio_summary');
  pgm.dropTable('meeting_notes');
  pgm.dropTable('points');
  pgm.dropTable('soft_facts');
  pgm.dropTable('clients');
  pgm.dropTable('sessions');
  pgm.dropTable('users');
};
