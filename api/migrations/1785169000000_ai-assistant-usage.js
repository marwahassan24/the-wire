/* eslint-disable camelcase */

export const shorthands = undefined;

export const up = (pgm) => {
  // ---------------------------------------------------------------------
  // One row per "opened a draft in ChatGPT/Claude" click from the AI reply
  // tool (web/public/tools/ai-reply-tool.html), so its header can show a
  // shared This week / Total count for the whole team instead of a
  // per-browser localStorage number. Never the client message text
  // itself - just enough to count usage. user_id is nullable: the tool
  // is an iframe on a different origin from this API and its fetch calls
  // use credentials: 'same-origin' (see the tool's own file), so the
  // session cookie never reaches here - almost every row will be
  // anonymous, which is expected, not a bug.
  // ---------------------------------------------------------------------
  pgm.createTable('ai_assistant_usage', {
    id: 'id',
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    mode: { type: 'text' },
    model: { type: 'text' },
    user_id: { type: 'integer', references: 'users' },
  });
  pgm.createIndex('ai_assistant_usage', 'created_at');
};

export const down = (pgm) => {
  pgm.dropTable('ai_assistant_usage');
};
