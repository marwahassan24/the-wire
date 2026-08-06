import { theme as C } from "../theme.js";
import { fmtDate } from "../format.js";
import type { ClientDaysAlive } from "../types.js";
import { CollapsibleSection, Pill } from "./ui.js";

const STATUS_TONE = { pending: "amber", sent: "primary", failed: "red", skipped: "plain" } as const;

// "Days on the Planet" - everything here is computed fresh from dob on
// every load (see daysAlive/clientSummary.ts on the API side); nothing
// is a stored figure that could go stale.
export function DaysAliveSection({
  daysAlive,
  open,
  onToggle,
}: {
  daysAlive: ClientDaysAlive | null;
  open: boolean;
  onToggle: () => void;
}) {
  const summary = !daysAlive
    ? "- no date of birth on file"
    : daysAlive.nextMilestone
      ? `- ${daysAlive.nextMilestone.days.toLocaleString("en-GB")} days in ${daysAlive.nextMilestone.daysUntil}d`
      : `- ${daysAlive.daysAlive.toLocaleString("en-GB")} days alive`;

  return (
    <CollapsibleSection id="days-alive" title="11. Days on the Planet" summary={summary} open={open} onToggle={onToggle}>
      {!daysAlive && (
        <div style={{ fontSize: C.text.small, color: C.inkSoft }}>
          No date of birth on file - milestone alerts need one to calculate from.
        </div>
      )}
      {daysAlive && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <Stat label="Days alive" value={daysAlive.daysAlive.toLocaleString("en-GB")} />
            {daysAlive.nextMilestone ? (
              <>
                <Stat label="Next milestone" value={daysAlive.nextMilestone.days.toLocaleString("en-GB")} />
                <Stat label="Milestone date" value={fmtDate(daysAlive.nextMilestone.date)} />
                <Stat label="Days until" value={String(daysAlive.nextMilestone.daysUntil)} />
              </>
            ) : (
              <div style={{ fontSize: C.text.small, color: C.inkSoft, alignSelf: "center" }}>
                No upcoming milestones enabled.
              </div>
            )}
          </div>

          {daysAlive.alerts.length > 0 && (
            <div style={{ paddingTop: 14, borderTop: `1px solid ${C.line}` }}>
              <div style={{ fontSize: C.text.small, color: C.inkSoft, marginBottom: 8 }}>Milestone alerts</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {daysAlive.alerts.map((alert) => (
                  <div key={alert.id} style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <Pill tone={STATUS_TONE[alert.status]}>{alert.status}</Pill>
                    <span style={{ fontSize: C.text.small, color: C.ink }}>
                      {alert.milestoneDays.toLocaleString("en-GB")} days - {fmtDate(alert.milestoneDate)}
                    </span>
                    <span style={{ fontSize: C.text.small, color: C.inkSoft }}>
                      alert {fmtDate(alert.alertDate)}
                      {alert.sentAt ? ` · sent ${fmtDate(alert.sentAt)}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </CollapsibleSection>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: C.text.small, color: C.inkSoft }}>{label}</div>
      <div style={{ fontSize: C.text.body, fontWeight: 600, color: C.ink, marginTop: 2 }}>{value}</div>
    </div>
  );
}
