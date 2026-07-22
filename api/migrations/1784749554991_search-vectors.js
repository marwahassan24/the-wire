/* eslint-disable camelcase */

export const shorthands = undefined;

// Generated, stored tsvector columns + GIN indexes across the four columns
// the brief names for search: soft_facts.text, points.text,
// meeting_notes.body, portfolio_summary.summary. Generated columns keep the
// vector in sync with the source text automatically (no trigger to
// maintain), and GIN is the standard index type for full-text search —
// this is what "index properly, don't do LIKE '%...%'" means in practice.
export const up = (pgm) => {
  pgm.sql(`
    ALTER TABLE soft_facts
      ADD COLUMN search_vector tsvector
      GENERATED ALWAYS AS (to_tsvector('english', text)) STORED;
    CREATE INDEX soft_facts_search_vector_idx ON soft_facts USING GIN (search_vector);
  `);

  pgm.sql(`
    ALTER TABLE points
      ADD COLUMN search_vector tsvector
      GENERATED ALWAYS AS (to_tsvector('english', text)) STORED;
    CREATE INDEX points_search_vector_idx ON points USING GIN (search_vector);
  `);

  pgm.sql(`
    ALTER TABLE meeting_notes
      ADD COLUMN search_vector tsvector
      GENERATED ALWAYS AS (to_tsvector('english', body)) STORED;
    CREATE INDEX meeting_notes_search_vector_idx ON meeting_notes USING GIN (search_vector);
  `);

  pgm.sql(`
    ALTER TABLE portfolio_summary
      ADD COLUMN search_vector tsvector
      GENERATED ALWAYS AS (to_tsvector('english', summary)) STORED;
    CREATE INDEX portfolio_summary_search_vector_idx ON portfolio_summary USING GIN (search_vector);
  `);
};

export const down = (pgm) => {
  pgm.sql(`DROP INDEX IF EXISTS portfolio_summary_search_vector_idx;`);
  pgm.sql(`ALTER TABLE portfolio_summary DROP COLUMN search_vector;`);

  pgm.sql(`DROP INDEX IF EXISTS meeting_notes_search_vector_idx;`);
  pgm.sql(`ALTER TABLE meeting_notes DROP COLUMN search_vector;`);

  pgm.sql(`DROP INDEX IF EXISTS points_search_vector_idx;`);
  pgm.sql(`ALTER TABLE points DROP COLUMN search_vector;`);

  pgm.sql(`DROP INDEX IF EXISTS soft_facts_search_vector_idx;`);
  pgm.sql(`ALTER TABLE soft_facts DROP COLUMN search_vector;`);
};
