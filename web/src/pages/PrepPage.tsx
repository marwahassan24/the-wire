import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { theme as C } from "../theme.js";
import { api } from "../api.js";
import { fmtDate } from "../format.js";
import type { PrepPack } from "../types.js";
import { Card, CollapsibleSection, Pill } from "../components/ui.js";
import { CONTACT_TYPE_LABEL } from "../components/ContactLogSection.js";
import { AssetAllocation } from "../components/AssetAllocation.js";

const POINT_TONE = { open: "amber", carried: "amber", resolved: "plain" } as const;
const TASK_STATUS_TONE = { awaiting_sense_check: "amber", confirmed: "primary", done: "plain" } as const;
const TASK_STATUS_LABEL: Record<string, string> = {
  awaiting_sense_check: "awaiting sense-check",
  confirmed: "confirmed",
  done: "done",
};

// What an adviser needs in front of them before walking into the room
// opens by default; what's merely useful to have on hand stays collapsed.
// The 1-minute reset isn't in this list - it's always visible, never
// collapsed (see the plain Card at the bottom of the page).
const SECTIONS: { id: string; title: string; defaultOpen: boolean }[] = [
  { id: "points", title: "Open and carried points", defaultOpen: true },
  { id: "soft-facts", title: "Recent soft facts", defaultOpen: true },
  { id: "tasks", title: "Outstanding tasks", defaultOpen: true },
  { id: "portfolio", title: "Portfolio", defaultOpen: false },
  { id: "meeting-note", title: "Last meeting note", defaultOpen: false },
  { id: "contact", title: "Recent contact", defaultOpen: false },
];

const RESET_ID = "reset";
const PREFS_KEY = "the-wire.prep-sections";

function loadSectionPrefs(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function saveSectionPrefs(prefs: Record<string, boolean>) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Private browsing / storage disabled - the toggle still works for
    // this session, it just won't be remembered next time.
  }
}

export function PrepPage() {
  const { id } = useParams<{ id: string }>();
  const [prep, setPrep] = useState<PrepPack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const saved = loadSectionPrefs();
    const initial: Record<string, boolean> = {};
    for (const s of SECTIONS) initial[s.id] = saved[s.id] ?? s.defaultOpen;
    return initial;
  });
  const [activeSection, setActiveSection] = useState<string>(SECTIONS[0].id);
  // While a sidebar click's smooth-scroll animation is still settling, the
  // scroll-spy effect below should leave the clicked section highlighted
  // rather than recompute mid-flight - see jumpToSection.
  const suppressScrollSpyRef = useRef(false);
  const suppressScrollSpyTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    setPrep(null);
    setError(null);
    api
      .get<PrepPack>(`/api/clients/${id}/prep`)
      .then(setPrep)
      .catch(() => setError("Couldn't load the prep pack for this client."));
  }, [id]);

  function toggleSection(sectionId: string) {
    setOpenSections((prev) => {
      const next = { ...prev, [sectionId]: !prev[sectionId] };
      saveSectionPrefs(next);
      return next;
    });
  }

  function jumpToSection(sectionId: string) {
    setOpenSections((prev) => {
      if (prev[sectionId] === true || !(sectionId in prev)) return prev;
      const next = { ...prev, [sectionId]: true };
      saveSectionPrefs(next);
      return next;
    });
    // Trust the click immediately rather than waiting for the scroll-spy
    // effect to work it out from scroll position. Near the end of the
    // page, several short collapsed sections can end up sharing a single
    // screenful with no room to scroll between them, which makes "closest
    // to the trigger line" genuinely ambiguous - but there's nothing
    // ambiguous about which section the user just asked to see. Suppress
    // the passive scroll-spy recompute until the resulting animation has
    // had time to settle, then let it resume tracking manual scrolling.
    setActiveSection(sectionId);
    suppressScrollSpyRef.current = true;
    window.clearTimeout(suppressScrollSpyTimerRef.current);
    suppressScrollSpyTimerRef.current = window.setTimeout(() => {
      suppressScrollSpyRef.current = false;
    }, 1000);
    // If sectionId was just opened above, its body isn't in the DOM yet -
    // scrolling immediately would target the collapsed (shorter) layout
    // and undershoot. Two rAFs wait for React to re-render and the browser
    // to paint the expanded layout before scrollIntoView measures it.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  // Scroll-spy: highlight whichever section card (including the always-open
  // 1-minute reset) is nearest the top of the viewport.
  //
  // The near-top trigger band works well while there's more page left to
  // scroll, but it breaks down for the tail of the page: once the
  // remaining sections are short (as collapsed ones are), there isn't
  // enough room left to scroll the last one up into the band, so it can
  // get stuck just below it and never highlight - no matter how the
  // section is registered. The bottom check below covers that directly:
  // once you've scrolled as far as the page allows, the last section is
  // active, full stop.
  useEffect(() => {
    if (!prep) return;
    const ids = [...SECTIONS.map((s) => s.id), RESET_ID];
    const lastSectionId = ids[ids.length - 1];
    let frame: number | null = null;

    function updateActive() {
      frame = null;
      if (suppressScrollSpyRef.current) return;
      const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
      if (atBottom) {
        setActiveSection(lastSectionId);
        return;
      }
      const triggerY = window.scrollY + window.innerHeight * 0.1;
      let current = ids[0];
      for (const sectionId of ids) {
        const el = document.getElementById(sectionId);
        if (el && el.getBoundingClientRect().top + window.scrollY <= triggerY) {
          current = sectionId;
        }
      }
      setActiveSection(current);
    }

    function onScroll() {
      if (frame === null) frame = requestAnimationFrame(updateActive);
    }

    updateActive();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [prep, openSections]);

  if (error) return <div style={{ color: C.red, fontSize: C.text.small }}>{error}</div>;
  if (!prep) return <div style={{ color: C.inkSoft, fontSize: C.text.small }}>Loading…</div>;

  const pointsSummary = prep.points.length === 0 ? "(empty)" : `(${prep.points.length} open)`;
  const softFactsSummary = prep.recentSoftFacts.length === 0 ? "(empty)" : `(${prep.recentSoftFacts.length})`;
  const tasksSummary = prep.outstandingTasks.length === 0 ? "(empty)" : `(${prep.outstandingTasks.length} open)`;
  const hasPortfolioSummary = prep.portfolio.summary.trim().length > 0;
  const portfolioSummaryLines = prep.portfolio.summary
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const portfolioSummary =
    !hasPortfolioSummary && prep.portfolio.recentLogs.length === 0
      ? "- empty"
      : hasPortfolioSummary && prep.portfolio.updated_at
        ? `- updated ${fmtDate(prep.portfolio.updated_at)}`
        : `- ${prep.portfolio.recentLogs.length} log ${prep.portfolio.recentLogs.length === 1 ? "entry" : "entries"}`;
  const meetingNoteSummary = !prep.lastMeetingNote
    ? "- empty"
    : prep.lastMeetingNote.status === "draft"
      ? "- draft awaiting approval"
      : `- last ${fmtDate(prep.lastMeetingNote.meeting_date)}`;
  const contactSummary =
    prep.recentContactLog.length === 0
      ? "- none logged"
      : `- last contact ${fmtDate(prep.recentContactLog[0].contact_date)}`;

  return (
    <div>
      <Link to={`/clients/${prep.id}`} style={{ fontSize: C.text.small, color: C.inkSoft, textDecoration: "none" }}>
        ← {prep.first_names} {prep.surname}
      </Link>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
        <div style={{ fontWeight: 700, fontSize: C.text.title }}>
          Prep: {prep.first_names} {prep.surname}
        </div>
        <Pill tone={prep.status === "Working" ? "primary" : "plain"}>{prep.status}</Pill>
      </div>
      <div style={{ fontSize: C.text.small, color: C.inkSoft, marginTop: 6, marginBottom: 32 }}>
        {prep.review_cycle} cycle
        {prep.next_review_date &&
          ` · next ${prep.next_review_type ?? "review"} ${fmtDate(prep.next_review_date)}`}
        {" · last contact "}
        {prep.lastContactDate ? fmtDate(prep.lastContactDate) : "none logged"}
      </div>

      <div className="spine-layout">
        <aside className="spine-sidebar">
          <nav className="spine-sidebar-list">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => jumpToSection(s.id)}
                style={{
                  fontWeight: activeSection === s.id ? 700 : 500,
                  color: activeSection === s.id ? C.primary : C.inkSoft,
                  background: activeSection === s.id ? C.primarySoft : "transparent",
                }}
              >
                {s.title}
              </button>
            ))}
            <button
              type="button"
              onClick={() => jumpToSection(RESET_ID)}
              style={{
                fontWeight: activeSection === RESET_ID ? 700 : 500,
                color: activeSection === RESET_ID ? C.primary : C.inkSoft,
                background: activeSection === RESET_ID ? C.primarySoft : "transparent",
              }}
            >
              The 1-minute reset
            </button>
          </nav>
        </aside>

        <div className="spine-main">
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <CollapsibleSection
              id="points"
              title="Open and carried points"
              summary={pointsSummary}
              open={openSections["points"]}
              onToggle={() => toggleSection("points")}
            >
              {prep.points.length === 0 && <Empty text="Nothing carried. A quiet file can represent excellent advice." />}
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                {prep.points.map((p) => (
                  <div key={p.id}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                      <span style={{ fontSize: C.text.small, fontWeight: 600, color: C.inkSoft }}>#{p.number}</span>
                      <Pill tone={POINT_TONE[p.status]}>{p.status}</Pill>
                      {p.raised_context && (
                        <span style={{ fontSize: C.text.small, color: C.inkSoft }}>{p.raised_context}</span>
                      )}
                    </div>
                    <div style={{ fontSize: C.text.body, lineHeight: 1.6 }}>{p.text}</div>
                    {p.resolution_note && (
                      <div style={{ fontSize: C.text.small, color: C.inkSoft, marginTop: 6 }}>
                        ↳ {p.resolution_note}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              id="soft-facts"
              title="Recent soft facts"
              summary={softFactsSummary}
              open={openSections["soft-facts"]}
              onToggle={() => toggleSection("soft-facts")}
            >
              {prep.recentSoftFacts.length === 0 && <Empty />}
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                {prep.recentSoftFacts.map((f) => (
                  <div key={f.id}>
                    <div style={{ fontSize: C.text.small, color: C.inkSoft, marginBottom: 4 }}>
                      {fmtDate(f.fact_date)}
                    </div>
                    <div style={{ fontSize: C.text.body, lineHeight: 1.6 }}>{f.text}</div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              id="tasks"
              title="Outstanding tasks"
              summary={tasksSummary}
              open={openSections["tasks"]}
              onToggle={() => toggleSection("tasks")}
            >
              {prep.outstandingTasks.length === 0 && <Empty text="All clear." />}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {prep.outstandingTasks.map((t) => (
                  <div key={t.id}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                      <Pill tone={TASK_STATUS_TONE[t.status]}>{TASK_STATUS_LABEL[t.status]}</Pill>
                      <span style={{ fontSize: C.text.small, color: C.inkSoft }}>
                        {t.owner_name}
                        {t.due_date && ` · due ${fmtDate(t.due_date)}`}
                        {t.source === "meeting_note" && " · from meeting note"}
                      </span>
                    </div>
                    <div style={{ fontSize: C.text.body, lineHeight: 1.5 }}>{t.text}</div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              id="portfolio"
              title="Portfolio"
              summary={portfolioSummary}
              open={openSections["portfolio"]}
              onToggle={() => toggleSection("portfolio")}
            >
              <AssetAllocation holdings={prep.portfolio.holdings} />

              <div style={{ marginBottom: prep.portfolio.recentLogs.length ? 20 : 0 }}>
                {portfolioSummaryLines.length > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: 20, fontSize: C.text.body, lineHeight: 1.6, color: C.ink }}>
                    {portfolioSummaryLines.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <Empty />
                )}
              </div>
              {prep.portfolio.recentLogs.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {prep.portfolio.recentLogs.map((l) => (
                    <div key={l.id} style={{ fontSize: C.text.small, display: "flex", gap: 12 }}>
                      <span style={{ color: C.inkSoft, flexShrink: 0 }}>{fmtDate(l.entry_date)}</span>
                      <span style={{ color: C.ink }}>{l.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </CollapsibleSection>

            <CollapsibleSection
              id="meeting-note"
              title="Last meeting note"
              summary={meetingNoteSummary}
              open={openSections["meeting-note"]}
              onToggle={() => toggleSection("meeting-note")}
            >
              {!prep.lastMeetingNote && <Empty />}
              {prep.lastMeetingNote && (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <span style={{ fontSize: C.text.small, color: C.inkSoft }}>
                      {prep.lastMeetingNote.meeting_type} · {fmtDate(prep.lastMeetingNote.meeting_date)}
                    </span>
                    <Pill tone={prep.lastMeetingNote.status === "approved" ? "primary" : "amber"}>
                      {prep.lastMeetingNote.status}
                    </Pill>
                  </div>
                  <div style={{ fontSize: C.text.body, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                    {prep.lastMeetingNote.body}
                  </div>
                </div>
              )}
            </CollapsibleSection>

            <CollapsibleSection
              id="contact"
              title="Recent contact"
              summary={contactSummary}
              open={openSections["contact"]}
              onToggle={() => toggleSection("contact")}
            >
              {prep.recentContactLog.length === 0 && <Empty />}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {prep.recentContactLog.map((c) => (
                  <div key={c.id}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                      <span style={{ fontSize: C.text.small, color: C.inkSoft }}>{fmtDate(c.contact_date)}</span>
                      <Pill tone="plain">{CONTACT_TYPE_LABEL[c.type]}</Pill>
                      <span style={{ fontSize: C.text.small, color: C.inkSoft }}>{c.staff_name}</span>
                    </div>
                    <div style={{ fontSize: C.text.body, lineHeight: 1.6 }}>{c.note}</div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>

            {/* Always visible, never collapsed - meant to be read right
                before walking into the room, not opened on demand. */}
            <Card id={RESET_ID} style={{ background: C.primarySoft, scrollMarginTop: 20 }}>
              <div style={{ fontSize: C.text.heading, fontWeight: 600, color: C.primary, marginBottom: 14 }}>
                The 1-minute reset - sit with these before you join the room
              </div>
              <div style={{ fontSize: C.text.body, fontStyle: "italic", lineHeight: 2, color: C.ink }}>
                Am I clear on who this client is - not just their numbers?
                <br />
                What has been heavy for them recently, even if nothing changed?
                <br />
                Am I open to this meeting ending without a decision?
                <br />
                Am I here to listen first, not lead with solutions?
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function Empty({ text = "Nothing here yet." }: { text?: string }) {
  return <div style={{ fontSize: C.text.small, color: C.inkSoft }}>{text}</div>;
}
