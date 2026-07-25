/* eslint-disable camelcase */

export const shorthands = undefined;

// sessions.id stays an internal serial PK; token is the opaque, random,
// server-verified value carried by the session cookie. The cookie is never
// trusted on its own — every request looks the token up against this table.
export const up = (pgm) => {
  pgm.addColumn('sessions', {
    token: { type: 'text', notNull: true, unique: true },
  });
};

export const down = (pgm) => {
  pgm.dropColumn('sessions', 'token');
};
