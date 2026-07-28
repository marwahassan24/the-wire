/* eslint-disable camelcase */

export const shorthands = undefined;

export const up = (pgm) => {
  // Links a task auto-created from a meeting note's "TCFP:"/"Client:"
  // action lines back to the note that produced it - lets a re-save of
  // an edited draft tell which lines already have a task, so it doesn't
  // create the same one twice, and lets the UI show, on the note, which
  // tasks came from it.
  pgm.addColumn('tasks', {
    meeting_note_id: { type: 'integer', references: 'meeting_notes' },
  });
  pgm.createIndex('tasks', 'meeting_note_id');
};

export const down = (pgm) => {
  pgm.dropColumn('tasks', 'meeting_note_id');
};
