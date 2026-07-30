import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { theme as C } from "../theme.js";
import { api } from "../api.js";
import { fmtDate } from "../format.js";
import type {
  Attachment,
  ClientSpine,
  ContactLog,
  MeetingNote,
  OutstandingItem,
  Point,
  Portfolio,
  SoftFact,
} from "../types.js";
import { Pill } from "../components/ui.js";
import { PointsSection } from "../components/PointsSection.js";
import { AttachmentsSection } from "../components/AttachmentsSection.js";
import { SoftFactsSection } from "../components/SoftFactsSection.js";
import { MeetingNoteSection } from "../components/MeetingNoteSection.js";
import { PortfolioSection } from "../components/PortfolioSection.js";
import { TasksSection } from "../components/TasksSection.js";
import { CasesSection } from "../components/CasesSection.js";
import { ContactLogSection } from "../components/ContactLogSection.js";
import { OutstandingItemsSection } from "../components/OutstandingItemsSection.js";
import { RecentlyDeletedSection } from "../components/RecentlyDeletedSection.js";

// The four Living Document sections stay in this fixed order - human
// detail first, technical detail last - per doctrine, not preference. The
// supporting sections below them (documents, tasks, cases, contact log)
// can grow freely and default to collapsed.
const SECTIONS: { id: string; title: string; defaultOpen: boolean }[] = [
  { id: "soft-facts", title: "1. Soft facts", defaultOpen: true },
  { id: "points", title: "2. Points to note and discuss", defaultOpen: true },
  { id: "meeting-note", title: "3. Meeting note", defaultOpen: true },
  { id: "portfolio", title: "4. Portfolio detail", defaultOpen: true },
  { id: "documents", title: "5. Documents", defaultOpen: false },
  { id: "tasks", title: "6. Tasks", defaultOpen: false },
  { id: "cases", title: "7. Cases", defaultOpen: false },
  { id: "contact-log", title: "8. Contact log", defaultOpen: false },
  { id: "outstanding-items", title: "9. Outstanding items", defaultOpen: false },
  { id: "recently-deleted", title: "10. Recently deleted", defaultOpen: false },
];

const PREFS_KEY = "the-wire.spine-sections";

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

export function ClientSpinePage() {
  const { id } = useParams<{ id: string }>();
  const [client, setClient] = useState<ClientSpine | null>(null);
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
  // TasksSection fetches its own tasks once on mount (GET /api/tasks has
  // no client filter, so it self-fetches and filters client-side) - it has
  // no way to know a saved meeting note just created new ones elsewhere on
  // the page. Bumping this remounts it, forcing a fresh fetch, same fix as
  // the key={latest.id} staleness bug on the meeting note view itself.
  const [taskRefreshKey, setTaskRefreshKey] = useState(0);

  function refetchClient() {
    return api
      .get<ClientSpine>(`/api/clients/${id}`)
      .then(setClient)
      .catch(() => setError("Couldn't load this client."));
  }

  useEffect(() => {
    setClient(null);
    setError(null);
    refetchClient();
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
      if (prev[sectionId]) return prev;
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

  // Scroll-spy: highlight whichever section card is nearest the top of the
  // viewport. Section cards keep their header (and id) mounted even while
  // collapsed, so this doesn't need to depend on which sections are open.
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
    if (!client) return;
    const ids = SECTIONS.map((s) => s.id);
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
  }, [client, openSections]);

  if (error) return <div style={{ color: C.red, fontSize: C.text.small }}>{error}</div>;
  if (!client) return <div style={{ color: C.inkSoft, fontSize: C.text.small }}>Loading…</div>;

  return (
    <div>
      <Link to="/clients" style={{ fontSize: C.text.small, color: C.inkSoft, textDecoration: "none" }}>
        ← Clients
      </Link>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontWeight: 700, fontSize: C.text.title }}>
            {client.first_names} {client.surname}
          </div>
          <Pill tone={client.status === "Working" ? "primary" : "plain"}>{client.status}</Pill>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <Link
            to={`/clients/${client.id}/edit`}
            style={{ fontSize: C.text.small, color: C.inkSoft, textDecoration: "none", fontWeight: 600 }}
          >
            Edit
          </Link>
          <Link
            to={`/clients/${client.id}/prep`}
            style={{ fontSize: C.text.small, color: C.primary, textDecoration: "none", fontWeight: 600 }}
          >
            Prep view →
          </Link>
        </div>
      </div>
      <div style={{ fontSize: C.text.small, color: C.inkSoft, marginTop: 6, marginBottom: 32 }}>
        {client.review_cycle} cycle
        {client.next_review_date &&
          ` · next ${client.next_review_type ?? "review"} ${fmtDate(client.next_review_date)}`}
        {" · last contact "}
        {client.lastContactDate ? fmtDate(client.lastContactDate) : "none logged"}
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
          </nav>
        </aside>

        <div className="spine-main">
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <SoftFactsSection
              clientId={client.id}
              softFacts={client.softFacts}
              onChange={(softFacts: SoftFact[]) => setClient({ ...client, softFacts })}
              open={openSections["soft-facts"]}
              onToggle={() => toggleSection("soft-facts")}
            />

            <PointsSection
              clientId={client.id}
              points={client.points}
              onChange={(points: Point[]) => setClient({ ...client, points })}
              open={openSections["points"]}
              onToggle={() => toggleSection("points")}
            />

            <MeetingNoteSection
              clientId={client.id}
              meetingNotes={client.meetingNotes}
              onChange={(meetingNotes: MeetingNote[]) => {
                setClient({ ...client, meetingNotes });
                setTaskRefreshKey((k) => k + 1);
              }}
              open={openSections["meeting-note"]}
              onToggle={() => toggleSection("meeting-note")}
            />

            <PortfolioSection
              clientId={client.id}
              portfolio={client.portfolio}
              onChange={(portfolio: Portfolio) => setClient({ ...client, portfolio })}
              open={openSections["portfolio"]}
              onToggle={() => toggleSection("portfolio")}
            />

            <AttachmentsSection
              clientId={client.id}
              attachments={client.attachments}
              onChange={(attachments: Attachment[]) => setClient({ ...client, attachments })}
              open={openSections["documents"]}
              onToggle={() => toggleSection("documents")}
            />

            <TasksSection
              key={taskRefreshKey}
              clientId={client.id}
              open={openSections["tasks"]}
              onToggle={() => toggleSection("tasks")}
              onTaskStatusChanged={refetchClient}
            />

            <CasesSection
              clientId={client.id}
              open={openSections["cases"]}
              onToggle={() => toggleSection("cases")}
            />

            <ContactLogSection
              clientId={client.id}
              contactLog={client.contactLog}
              onChange={(contactLog: ContactLog[]) =>
                setClient({ ...client, contactLog, lastContactDate: contactLog[0]?.contact_date ?? null })
              }
              open={openSections["contact-log"]}
              onToggle={() => toggleSection("contact-log")}
            />

            <OutstandingItemsSection
              clientId={client.id}
              outstandingItems={client.outstandingItems}
              onChange={(outstandingItems: OutstandingItem[]) => setClient({ ...client, outstandingItems })}
              open={openSections["outstanding-items"]}
              onToggle={() => toggleSection("outstanding-items")}
            />

            <RecentlyDeletedSection
              clientId={client.id}
              open={openSections["recently-deleted"]}
              onToggle={() => toggleSection("recently-deleted")}
              onRestored={refetchClient}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
