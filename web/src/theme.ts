// Town Close brand — deep purple primary, vibrant secondary palette.
// Yellow means "a human is needed here": sense-check states, imminent reviews.
// Plus Jakarta Sans is a stand-in until the real typeface is confirmed with
// Martine (per BUILD-BRIEF.md) — do not swap this without that sign-off.
export const theme = {
  paper: "#faf9fd",
  card: "#ffffff",
  ink: "#342562",
  inkSoft: "#7a72a0",
  primary: "#342562",
  primarySoft: "#efecf8",
  primaryLine: "#cdc5e8",
  pink: "#EB4B98",
  magenta: "#F26DF9",
  mauve: "#B97CAF",
  yellow: "#FFF275",
  amber: "#c9187c",
  amberSoft: "#fff3a1",
  red: "#a11b1b",
  redSoft: "#f9eeee",
  line: "#e4e0f0",
  mono: "'SF Mono','Menlo','Consolas',monospace",
  sans: "'Plus Jakarta Sans','Figtree',-apple-system,'Segoe UI',Roboto,sans-serif",
} as const;
