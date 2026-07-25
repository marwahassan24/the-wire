// Town Close brand — deep purple primary, vibrant secondary palette.
// Yellow means "a human is needed here": sense-check states, imminent reviews.
//
// Typeface: system-ui, with a proper fallback stack, until the real Town
// Close typeface is confirmed with Martine (per BUILD-BRIEF.md). This
// supersedes the earlier Plus Jakarta Sans stand-in — advisers and client
// managers are in these screens before every meeting, and a system font
// renders faster and reads calmer than a webfont nobody's signed off on yet.
//
// Type scale: body copy is never smaller than 16px, and nothing anywhere
// drops below 14px. Hierarchy comes from weight and size, not from mono
// fonts, uppercase, letter-spacing, or hard borders.
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
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  contentWidth: 900,
  text: {
    title: 26,
    heading: 17,
    body: 16,
    small: 14,
  },
} as const;
