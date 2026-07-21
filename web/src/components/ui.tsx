import type { ButtonHTMLAttributes, CSSProperties, InputHTMLAttributes, ReactNode } from "react";
import { theme as C } from "../theme.js";

export function Eyebrow({ children, color = C.inkSoft }: { children: ReactNode; color?: string }) {
  return (
    <div
      style={{
        fontFamily: C.mono,
        fontSize: 10.5,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color,
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

const PILL_TONES = {
  primary: { bg: C.primarySoft, fg: C.primary, bd: C.primaryLine },
  amber: { bg: C.amberSoft, fg: "#4a3a86", bd: "#ece28a" },
  red: { bg: C.redSoft, fg: C.red, bd: "#e3bcbc" },
  plain: { bg: "transparent", fg: C.inkSoft, bd: C.line },
} as const;

export function Pill({ children, tone = "primary" }: { children: ReactNode; tone?: keyof typeof PILL_TONES }) {
  const t = PILL_TONES[tone];
  return (
    <span
      style={{
        fontFamily: C.mono,
        fontSize: 10.5,
        padding: "3px 9px",
        borderRadius: 3,
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.bd}`,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

const BTN_TONES = {
  ink: { bg: C.ink, fg: "#fff", bd: C.ink },
  pink: { bg: C.pink, fg: "#fff", bd: C.pink },
  ghost: { bg: "transparent", fg: C.inkSoft, bd: C.line },
} as const;

export function Btn({
  tone = "ink",
  small,
  style,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: keyof typeof BTN_TONES; small?: boolean }) {
  const t = BTN_TONES[tone];
  return (
    <button
      {...props}
      style={{
        fontFamily: C.sans,
        fontSize: small ? 12 : 13,
        fontWeight: 600,
        padding: small ? "5px 11px" : "8px 16px",
        borderRadius: 4,
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.bd}`,
        cursor: "pointer",
        ...style,
      }}
    />
  );
}

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 6, padding: 20, ...style }}>
      {children}
    </div>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        fontFamily: C.sans,
        fontSize: 13,
        padding: "8px 12px",
        borderRadius: 4,
        border: `1px solid ${C.line}`,
        background: "#fff",
        color: C.ink,
        outline: "none",
        width: "100%",
        boxSizing: "border-box",
        ...props.style,
      }}
    />
  );
}
