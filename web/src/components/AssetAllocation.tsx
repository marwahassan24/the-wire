import { theme as C } from "../theme.js";
import { fmtGBP } from "../format.js";
import type { PortfolioHolding } from "../types.js";

// Categorical palette for the four asset classes the firm actually uses,
// derived from the brand hues in theme.ts (purple/pink/yellow/red - the
// only distinct hue families the brand has) and validated with the
// dataviz skill's validate_palette.js:
//
//   node scripts/validate_palette.js \
//     "#6551ac,#9d8f00,#a11b1b,#EB4B98" --mode light --surface "#ffffff" --pairs all
//   -> ALL CHECKS PASS (worst CVD ΔE 10.6, worst normal-vision ΔE 22.7,
//      all >= 3:1 contrast) - safe in every pairing, not just neighbours,
//      so it holds regardless of which subset a client's holdings use or
//      where "Other" falls in the ring.
//
// primary and yellow needed lightening to clear the light-mode OKLCH L
// band (0.43-0.77) - same hue angle, adjusted lightness only. pink and
// red are the brand's literal hex values, unchanged.
const ASSET_CLASS_ORDER = ["Equity", "Fixed Income", "Property", "Cash"] as const;
const ASSET_CLASS_COLORS: Record<string, string> = {
  Equity: "#6551ac",
  "Fixed Income": "#9d8f00",
  Property: "#a11b1b",
  Cash: "#EB4B98",
};

// "Other" is deliberately NOT a fifth categorical hue - it's a neutral,
// desaturated catch-all for whatever moneyinfo eventually sends back that
// isn't one of the four classes above (see the skill's "never generate a
// 9th hue - fold it into Other" rule). It fails the categorical chroma
// and CVD-vs-hue checks by design (a gray has no hue to separate), which
// is why it's validated separately, on its own terms: >=3:1 contrast
// (#918da5 measures 3.20:1 on white) and always paired with a direct
// label in both the legend and the breakdown below, never color alone.
const OTHER_LABEL = "Other";
const OTHER_COLOR = "#918da5";

interface Slice {
  label: string;
  color: string;
  value: number;
}

interface Group extends Slice {
  holdings: PortfolioHolding[];
}

function groupHoldings(holdings: PortfolioHolding[]): Group[] {
  const byLabel = new Map<string, PortfolioHolding[]>();
  for (const h of holdings) {
    const label = h.asset_class ?? "Uncategorised";
    const list = byLabel.get(label);
    if (list) list.push(h);
    else byLabel.set(label, [h]);
  }

  const known = ASSET_CLASS_ORDER.filter((label) => byLabel.has(label));
  const unknown = [...byLabel.keys()]
    .filter((label) => !(ASSET_CLASS_ORDER as readonly string[]).includes(label))
    .sort();

  return [...known, ...unknown].map((label) => {
    const list = byLabel.get(label)!;
    return {
      label,
      color: ASSET_CLASS_COLORS[label] ?? OTHER_COLOR,
      value: list.reduce((sum, h) => sum + (h.value !== null ? Number(h.value) : 0), 0),
      holdings: list,
    };
  });
}

// The chart pools every non-canonical group into one "Other" slice - the
// breakdown below still lists each of them separately, by their real
// name, with its own subtotal. Nothing is lost, the ring just doesn't
// grow a hue for a long tail.
function chartSlices(groups: Group[]): Slice[] {
  const slices: Slice[] = groups
    .filter((g) => g.label in ASSET_CLASS_COLORS)
    .map(({ label, color, value }) => ({ label, color, value }));
  const otherTotal = groups
    .filter((g) => !(g.label in ASSET_CLASS_COLORS))
    .reduce((sum, g) => sum + g.value, 0);
  if (otherTotal > 0) slices.push({ label: OTHER_LABEL, color: OTHER_COLOR, value: otherTotal });
  return slices;
}

const SIZE = 200;
const RADIUS = 74;
const STROKE = 32;
const GAP = 3;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function Donut({ slices, total }: { slices: Slice[]; total: number }) {
  let cumulative = 0;
  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Asset allocation">
      <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
        <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke={C.card} strokeWidth={STROKE} />
        {slices.map((s) => {
          const length = (s.value / total) * CIRCUMFERENCE;
          const rendered = Math.max(0, length - GAP);
          const offset = -(cumulative + GAP / 2);
          cumulative += length;
          const pct = Math.round((s.value / total) * 100);
          return (
            <circle
              key={s.label}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke={s.color}
              strokeWidth={STROKE}
              strokeDasharray={`${rendered} ${CIRCUMFERENCE - rendered}`}
              strokeDashoffset={offset}
            >
              <title>
                {s.label}: {fmtGBP(s.value)} ({pct}%)
              </title>
            </circle>
          );
        })}
      </g>
      <text
        x={SIZE / 2}
        y={SIZE / 2 - 6}
        textAnchor="middle"
        style={{ fontSize: 12, fill: C.inkSoft, fontFamily: C.sans }}
      >
        Total
      </text>
      <text
        x={SIZE / 2}
        y={SIZE / 2 + 17}
        textAnchor="middle"
        style={{ fontSize: 20, fontWeight: 700, fill: C.ink, fontFamily: C.sans }}
      >
        {fmtGBP(total)}
      </text>
    </svg>
  );
}

export function AssetAllocation({ holdings }: { holdings: PortfolioHolding[] }) {
  if (holdings.length === 0) return null;

  const groups = groupHoldings(holdings);
  const total = groups.reduce((sum, g) => sum + g.value, 0);
  if (total <= 0) return null;

  const slices = chartSlices(groups);

  return (
    <div style={{ marginBottom: 24, paddingBottom: 24, borderBottom: `1px solid ${C.line}` }}>
      <div style={{ display: "flex", gap: 32, flexWrap: "wrap", alignItems: "center", marginBottom: 28 }}>
        <Donut slices={slices} total={total} />
        <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minWidth: 220 }}>
          {slices.map((s) => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{ width: 10, height: 10, borderRadius: "50%", background: s.color, flexShrink: 0 }}
                aria-hidden
              />
              <span style={{ fontSize: C.text.small, fontWeight: 600, color: C.ink, flex: 1 }}>{s.label}</span>
              <span style={{ fontSize: C.text.small, color: C.inkSoft, fontVariantNumeric: "tabular-nums" }}>
                {fmtGBP(s.value)} · {Math.round((s.value / total) * 100)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {groups.map((g) => (
          <div key={g.label}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span
                style={{ width: 8, height: 8, borderRadius: "50%", background: g.color, flexShrink: 0 }}
                aria-hidden
              />
              <span style={{ fontSize: C.text.small, fontWeight: 600, color: C.ink }}>{g.label}</span>
              <span
                style={{
                  fontSize: C.text.small,
                  color: C.inkSoft,
                  marginLeft: "auto",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {fmtGBP(g.value)}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 18 }}>
              {g.holdings.map((h) => (
                <div
                  key={h.id}
                  style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: C.text.small }}
                >
                  <span style={{ color: C.ink }}>
                    {h.holding_name ?? "Holding"}
                    {(h.provider || h.plan_type) && (
                      <span style={{ color: C.inkSoft }}>
                        {" "}
                        · {[h.provider, h.plan_type].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                  <span style={{ color: C.inkSoft, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                    {h.value !== null ? fmtGBP(Number(h.value)) : "-"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            paddingTop: 14,
            borderTop: `1px solid ${C.line}`,
            fontWeight: 700,
            fontSize: C.text.body,
          }}
        >
          <span>Overall total</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtGBP(total)}</span>
        </div>
      </div>
    </div>
  );
}
