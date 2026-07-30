import type { ButtonHTMLAttributes, CSSProperties, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { theme as C } from "../theme.js";

// A section heading inside a card: sentence case, body typeface, weight and
// size carry the hierarchy. Real space below it separates the heading from
// what follows, rather than a rule or a border doing that job.
export function SectionHeading({ children, color = C.ink }: { children: ReactNode; color?: string }) {
  return (
    <div style={{ fontSize: C.text.heading, fontWeight: 600, lineHeight: 1.3, color, marginBottom: 16 }}>
      {children}
    </div>
  );
}

const PILL_TONES = {
  primary: { bg: C.primarySoft, fg: C.primary },
  amber: { bg: C.amberSoft, fg: "#4a3a86" },
  red: { bg: C.redSoft, fg: C.red },
  plain: { bg: C.paper, fg: C.inkSoft },
} as const;

export function Pill({ children, tone = "primary" }: { children: ReactNode; tone?: keyof typeof PILL_TONES }) {
  const t = PILL_TONES[tone];
  return (
    <span
      style={{
        fontSize: C.text.small,
        lineHeight: 1.3,
        padding: "4px 11px",
        borderRadius: 20,
        background: t.bg,
        color: t.fg,
        whiteSpace: "nowrap",
        display: "inline-block",
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
        fontSize: small ? C.text.small : 15,
        fontWeight: 600,
        lineHeight: 1.3,
        padding: small ? "8px 14px" : "10px 18px",
        borderRadius: 8,
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.bd}`,
        cursor: "pointer",
        ...style,
      }}
    />
  );
}

export function Card({
  children,
  style,
  id,
  title,
}: {
  children: ReactNode;
  style?: CSSProperties;
  id?: string;
  title?: string;
}) {
  return (
    <div
      id={id}
      title={title}
      style={{
        background: C.card,
        borderRadius: 14,
        padding: 28,
        boxShadow: "0 1px 2px rgba(52, 37, 98, 0.06), 0 1px 12px rgba(52, 37, 98, 0.04)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// A section that can be collapsed to just its header. The header stays in
// the DOM (and keeps its id) even when collapsed, so a sidebar link can
// scroll to it and an IntersectionObserver can track it for scroll-spy -
// only the body underneath is conditionally rendered.
export function CollapsibleSection({
  id,
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <Card id={id} style={{ scrollMarginTop: 20 }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          all: "unset",
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          width: "100%",
          cursor: "pointer",
          marginBottom: open ? 16 : 0,
        }}
      >
        <span style={{ fontSize: C.text.heading, fontWeight: 600, lineHeight: 1.3, color: C.ink }}>
          {title} <span style={{ fontWeight: 400, color: C.inkSoft }}>{summary}</span>
        </span>
        <span
          style={{
            flexShrink: 0,
            fontSize: 44,
            lineHeight: 1,
            color: C.ink,
            transform: open ? "rotate(180deg)" : undefined,
            transition: "transform 0.15s ease",
          }}
        >
          ▾
        </span>
      </button>
      {open && <div>{children}</div>}
    </Card>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        fontFamily: C.sans,
        fontSize: C.text.body,
        lineHeight: 1.5,
        padding: "12px 14px",
        borderRadius: 8,
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

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      style={{
        fontFamily: C.sans,
        fontSize: C.text.body,
        lineHeight: 1.6,
        padding: "12px 14px",
        borderRadius: 8,
        border: `1px solid ${C.line}`,
        background: "#fff",
        color: C.ink,
        outline: "none",
        width: "100%",
        boxSizing: "border-box",
        minHeight: 140,
        resize: "vertical",
        ...props.style,
      }}
    />
  );
}

export function Select({
  value,
  onChange,
  placeholder,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  children: ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        fontFamily: C.sans,
        fontSize: C.text.body,
        padding: "10px 12px",
        borderRadius: 8,
        border: `1px solid ${C.line}`,
        background: "#fff",
        color: C.ink,
      }}
    >
      <option value="">{placeholder}</option>
      {children}
    </select>
  );
}
