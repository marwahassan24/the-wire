import { useState, useEffect, useMemo, useRef } from "react";

/* ============================================================
   THE WIRE — TCFP CRM-lite prototype (v0.1, pre-scope)
   The Living Document is the spine. Everything reads from it.
   Test data only — surnames are TESTCLIENT by design.
   ============================================================ */

/* Town Close brand — deep purple primary (#342562), vibrant secondary
   palette. Semantics: purple = the firm; pink = action; yellow = a human
   judgement is needed; mauve = quiet/neutral. */
const C = {
  paper: "#faf9fd",
  card: "#ffffff",
  ink: "#342562",
  inkSoft: "#7a72a0",
  green: "#342562",      // primary purple (key names kept for wiring)
  greenSoft: "#efecf8",
  greenLine: "#cdc5e8",
  pink: "#EB4B98",
  magenta: "#F26DF9",
  mauve: "#B97CAF",
  yellow: "#FFF275",
  amber: "#c9187c",      // readable pink for "human needed" text
  amberSoft: "#fff3a1",  // soft brand yellow for highlight fills
  red: "#a11b1b",
  redSoft: "#f9eeee",
  line: "#e4e0f0",
  mono: "'SF Mono','Menlo','Consolas',monospace",
  serif: "'Plus Jakarta Sans','Figtree','Segoe UI',sans-serif",
  sans: "'Plus Jakarta Sans','Figtree',-apple-system,'Segoe UI',Roboto,sans-serif",
};

const STORE_KEY = "the-wire-v01";

/* ---------------- seed data (TESTCLIENT only) ---------------- */
const seedData = () => ({
  clients: [
    {
      id: "c1",
      firstName: "Chris & Helen",
      surname: "TESTCLIENT",
      dob: "1962-04-11",
      dob2: "1964-09-02",
      email: "chris.testclient@example.com",
      phone: "07700 900001",
      status: "Retired",
      adviser: "Jeremy",
      cm: "Louise",
      nextMeeting: { date: "2026-08-04", type: "Annual" },
      reviewCycle: "Annual", lastReview: "2026-02-10",
      cases: [{ id: "k1", title: "Care fee direct debit — confirm provider position", stage: "Provider Processing", waiting: "Provider", updated: "2026-06-30", owner: "Louise" }],
      softFacts: [
        { id: "s1", date: "2026-06-12", text: "Granddaughter Layla born — sister to Isla. Whole family down in Cornwall for two weeks in August." },
        { id: "s2", date: "2026-05-02", text: "Right shoulder may have gone again — rotator cuff last time. Op possible in autumn." },
        { id: "s3", date: "2025-11-20", text: "Ferrari put away for winter. Talking about one last continental trip in it next summer." },
      ],
      points: [
        { id: "p1", num: 1, text: "His dad's care fees may need a DD around March time — still looking likely?", status: "carried", resolution: "Carry forward — forgot to ask at Interim.", from: "Interim, Feb 2026" },
        { id: "p2", num: 2, text: "Chris using up 20% band with Fidelity income — check if expecting any income from company?", status: "open", resolution: "", from: "Annual, Aug 2025" },
        { id: "p3", num: 3, text: "Helen's ISA allowance — £14,200 unused this tax year.", status: "open", resolution: "", from: "Prep, Jul 2026" },
      ],
      meetingNotes: [
        {
          id: "m1", date: "2026-02-10", type: "Interim",
          text: "Overall position\nA quiet six months, and a good one. Nothing needed changing, which is itself a sign the plan is working.\n\nCash flow & spending\nSpending remains comfortably within the plan. The Cornwall house purchase fund stays where it is until the family decides.\n\nNext steps & actions\nTCFP: confirm the position on the care fee direct debit before the Annual.\nClient: let us know once the Cornwall conversation has moved on.",
        },
      ],
      portfolio: {
        summary: "Fidelity GIA + ISAs, RJIS discretionary. Cash buffer 18 months' spending. Regular withdrawal £3,500/m from JB GIA. CGT realised YTD £4,100 of £3,000 allowance — watch. Voyant refreshed May 2026.",
        logs: [
          { id: "l1", date: "2026-06-28", text: "£20k withdrawal sent from JB GIA (house fund top-up)." },
          { id: "l2", date: "2026-04-14", text: "ISA subscriptions completed for both, 2026/27." },
        ],
      },
      tasks: [
        { id: "t1", text: "Confirm care fee DD position with provider before Annual", owner: "Louise", due: "2026-07-28", status: "confirmed" },
        { id: "t2", text: "Draft info request message to client for Annual", owner: "Louise", due: "2026-07-21", status: "sense" },
      ],
    },
    {
      id: "c2",
      firstName: "Aaron",
      surname: "TESTCLIENT",
      dob: "1981-01-27",
      dob2: "",
      email: "aaron.testclient@example.com",
      phone: "07700 900002",
      status: "Working",
      adviser: "Zoe",
      cm: "Sarah",
      nextMeeting: { date: "2026-09-15", type: "Interim" },
      reviewCycle: "Annual", lastReview: "2025-11-18",
      cases: [{ id: "k1", title: "Protection review — comparison once salary confirmed", stage: "Research", waiting: "Client", updated: "2026-06-20", owner: "Sarah" }],
      softFacts: [
        { id: "s1", date: "2026-05-30", text: "Got the MD role at Marsh — starts September. Big step up, some nerves under the excitement." },
        { id: "s2", date: "2026-03-15", text: "Training for a half marathon with his brother. Knee holding up so far." },
      ],
      points: [
        { id: "p1", num: 1, text: "New MD package — share scheme details needed before we can advise on pension headroom.", status: "open", resolution: "", from: "Call, Jun 2026" },
        { id: "p2", num: 2, text: "Protection review promised last Annual — still outstanding.", status: "carried", resolution: "Carry forward — waiting on new salary confirmation.", from: "Annual, Nov 2025" },
      ],
      meetingNotes: [
        {
          id: "m1", date: "2025-11-18", type: "Annual",
          text: "Overall position\nA strong year. The promotion conversation was already in the air, and the plan is built to absorb good news as well as bad.\n\nPension contributions\nHolding at current levels until the new package is confirmed, then we revisit headroom.\n\nNext steps & actions\nClient: send through the share scheme booklet when it arrives.\nTCFP: prepare a protection comparison once salary is confirmed.",
        },
      ],
      portfolio: {
        summary: "Workplace pension + SIPP, S&S ISA maxed 25/26. No GIA. Annual allowance headroom depends on new package — flagged in Points.",
        logs: [{ id: "l1", date: "2026-04-08", text: "ISA subscription 2026/27 completed." }],
      },
      tasks: [
        { id: "t1", text: "Chase share scheme booklet", owner: "Sarah", due: "2026-08-01", status: "confirmed" },
      ],
    },
    {
      id: "c3",
      firstName: "Margaret",
      surname: "TESTCLIENT",
      dob: "1949-08-19",
      dob2: "",
      email: "margaret.testclient@example.com",
      phone: "07700 900003",
      status: "Retired",
      adviser: "Jeremy",
      cm: "Louise",
      nextMeeting: { date: "2026-07-29", type: "Interim" },
      reviewCycle: "Annual", lastReview: "2026-01-22",
      cases: [{ id: "k1", title: "Gifting options — JISA vs direct", stage: "Recommendation", waiting: "Us", updated: "2026-07-15", owner: "Jeremy" }],
      softFacts: [
        { id: "s1", date: "2026-07-01", text: "Sister's health worsening — Margaret is now driving to Norwich most weekends. Sounded tired on the phone." },
        { id: "s2", date: "2026-02-11", text: "Joined the village choir. First concert in June — 'terrifying and wonderful'." },
      ],
      points: [
        { id: "p1", num: 1, text: "Gifting to grandchildren — wants to 'do something meaningful while I can see them enjoy it'. Explore JISA vs direct gifts.", status: "open", resolution: "", from: "Annual, Jan 2026" },
        { id: "p2", num: 2, text: "Will last reviewed 2019. LPA in place. Nudge gently — sister situation may make this timely.", status: "open", resolution: "", from: "Prep, Jul 2026" },
      ],
      meetingNotes: [
        {
          id: "m1", date: "2026-01-22", type: "Annual",
          text: "Overall position\nEverything remains in good order, and Margaret should feel free to say yes to the things she's been hesitating over — the plan has room in it.\n\nFamily gifting\nWe discussed gifting to the grandchildren and agreed to bring worked options to the next meeting rather than rush a decision.\n\nNext steps & actions\nTCFP: prepare gifting options.\nClient: nothing needed — just enjoy the choir.",
        },
      ],
      portfolio: {
        summary: "RJIS discretionary + cash. Income comfortably covered by pensions; portfolio is legacy-oriented. IHT position reviewed Jan 2026 — within NRB + RNRB with current gifting plan.",
        logs: [],
      },
      tasks: [
        { id: "t1", text: "Prepare gifting options (JISA vs direct) for Interim", owner: "Jeremy", due: "2026-07-27", status: "confirmed" },
        { id: "t2", text: "Add sister situation to vulnerability watch-list — sense check with adviser", owner: "Louise", due: "2026-07-22", status: "sense" },
      ],
    },
  ],
});

/* ---------------- helpers ---------------- */
const emptyData = () => ({ clients: [] });
const blankClient = (f = {}) => ({
  id: uid(),
  firstName: f.firstName || "New client",
  surname: f.surname || "",
  dob: f.dob || "",
  dob2: "",
  email: f.email || "",
  phone: f.phone || "",
  status: f.status || "Working",
  adviser: f.adviser || "",
  cm: f.cm || "",
  nextMeeting: { date: "", type: "Annual" },
  reviewCycle: f.reviewCycle || "Annual",
  lastReview: f.lastReview || "",
  cases: [],
  softFacts: [],
  points: [],
  meetingNotes: [],
  portfolio: { summary: "", logs: [] },
  tasks: [],
});
const uid = () => Math.random().toString(36).slice(2, 9);
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d) => {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};
const ageFrom = (dob) => {
  if (!dob) return null;
  const b = new Date(dob), n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  const m = n.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && n.getDate() < b.getDate())) a--;
  return a;
};
const decadeOf = (age) => (age == null ? null : Math.floor(age / 10) * 10);
const daysUntil = (d) => {
  if (!d) return null;
  return Math.ceil((new Date(d + "T00:00:00") - new Date(today() + "T00:00:00")) / 86400000);
};

const STAGES = ["Fact Find", "Research", "Recommendation", "Suitability Report", "Compliance Review", "Client Approval", "Submission", "Provider Processing", "Completed"];
const WAITING = ["Us", "Client", "Provider", "Third party"];

/* ---------------- tiny UI atoms ---------------- */
const Eyebrow = ({ children, color = C.inkSoft }) => (
  <div style={{ fontFamily: C.mono, fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color, marginBottom: 6 }}>{children}</div>
);

const Pill = ({ children, tone = "green", onClick, active }) => {
  const tones = {
    green: { bg: C.greenSoft, fg: C.green, bd: C.greenLine },
    amber: { bg: C.amberSoft, fg: "#4a3a86", bd: "#ece28a" },
    red: { bg: C.redSoft, fg: C.red, bd: "#e3bcbc" },
    plain: { bg: "transparent", fg: C.inkSoft, bd: C.line },
  };
  const t = tones[tone];
  return (
    <span
      onClick={onClick}
      style={{
        fontFamily: C.mono, fontSize: 10.5, padding: "3px 9px", borderRadius: 3,
        background: active === false ? "transparent" : t.bg,
        color: t.fg, border: `1px solid ${active ? t.fg : t.bd}`,
        cursor: onClick ? "pointer" : "default", whiteSpace: "nowrap", userSelect: "none",
      }}
    >
      {children}
    </span>
  );
};

const Btn = ({ children, onClick, tone = "ink", small }) => {
  const tones = {
    ink: { bg: C.ink, fg: "#fff", bd: C.ink },
    green: { bg: C.pink, fg: "#fff", bd: C.pink },
    ghost: { bg: "transparent", fg: C.inkSoft, bd: C.line },
    amber: { bg: C.amber, fg: "#fff", bd: C.amber },
  };
  const t = tones[tone];
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: C.sans, fontSize: small ? 12 : 13, fontWeight: 600,
        padding: small ? "5px 11px" : "8px 16px", borderRadius: 4,
        background: t.bg, color: t.fg, border: `1px solid ${t.bd}`, cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
};

const Card = ({ children, style }) => (
  <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 6, padding: 20, ...style }}>{children}</div>
);

const Input = (props) => (
  <input
    {...props}
    style={{
      fontFamily: C.sans, fontSize: 13, padding: "8px 12px", borderRadius: 4,
      border: `1px solid ${C.line}`, background: "#fff", color: C.ink, outline: "none",
      width: "100%", boxSizing: "border-box", ...props.style,
    }}
  />
);

const TextArea = (props) => (
  <textarea
    {...props}
    style={{
      fontFamily: C.sans, fontSize: 13, lineHeight: 1.65, padding: "10px 12px", borderRadius: 4,
      border: `1px solid ${C.line}`, background: "#fff", color: C.ink, outline: "none",
      width: "100%", boxSizing: "border-box", resize: "vertical", ...props.style,
    }}
  />
);

/* ============================================================ */
export default function TheWire() {
  const [data, setData] = useState(null);
  const [view, setView] = useState({ page: "clients" }); // clients | client | cross | tasks
  const [saveState, setSaveState] = useState("idle");
  const loadedRef = useRef(false);

  /* load */
  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get(STORE_KEY, true);
        if (r && r.value) { setData(JSON.parse(r.value)); loadedRef.current = true; return; }
      } catch (e) { /* no saved data yet */ }
      setData(emptyData());
      loadedRef.current = true;
    })();
  }, []);

  /* save (debounced) — shared: everyone using this artifact sees the same data */
  useEffect(() => {
    if (!loadedRef.current || !data) return;
    setSaveState("saving");
    const t = setTimeout(async () => {
      try { await window.storage.set(STORE_KEY, JSON.stringify(data), true); setSaveState("saved"); }
      catch (e) { setSaveState("error"); }
    }, 600);
    return () => clearTimeout(t);
  }, [data]);

  /* poll for other people's changes */
  useEffect(() => {
    const iv = setInterval(async () => {
      if (!loadedRef.current) return;
      try {
        const r = await window.storage.get(STORE_KEY, true);
        if (r && r.value) {
          const incoming = r.value;
          setData((cur) => (JSON.stringify(cur) === incoming ? cur : JSON.parse(incoming)));
        }
      } catch (e) { /* offline or empty; keep what we have */ }
    }, 15000);
    return () => clearInterval(iv);
  }, []);

  const updateClient = (id, fn) =>
    setData((d) => ({ ...d, clients: d.clients.map((c) => (c.id === id ? fn(c) : c)) }));

  const resetData = async () => {
    const fresh = seedData();
    setData(fresh);
    try { await window.storage.set(STORE_KEY, JSON.stringify(fresh), true); } catch (e) {}
  };

  const clearAll = async () => {
    const fresh = emptyData();
    setData(fresh);
    try { await window.storage.set(STORE_KEY, JSON.stringify(fresh), true); } catch (e) {}
  };

  const addClient = (fields) => {
    const c = blankClient(fields);
    setData((d) => ({ ...d, clients: [...d.clients, c] }));
    setView({ page: "client", id: c.id, tab: "living" });
  };

  const importJson = (text) => {
    try {
      const parsed = JSON.parse(text);
      const clients = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.clients) ? parsed.clients : null;
      if (!clients) return "That doesn't look like Wire data — expected { \"clients\": [...] } or a plain array of clients.";
      const cleaned = clients.map((c) => ({ ...blankClient(c), ...c, id: c.id || uid() }));
      setData({ clients: cleaned });
      return null;
    } catch (e) {
      return "Couldn't parse that JSON — check for a stray comma or truncation and try again.";
    }
  };

  if (!data)
    return (
      <div style={{ minHeight: "100vh", background: C.paper, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: C.mono, color: C.inkSoft, fontSize: 12 }}>
        loading the spine…
      </div>
    );

  const activeClient = view.page === "client" ? data.clients.find((c) => c.id === view.id) : null;

  return (
    <div style={{ minHeight: "100vh", background: C.paper, color: C.ink, fontFamily: C.sans }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Figtree:wght@400;600;700;800&display=swap');
        *:focus-visible { outline: 2px solid ${C.pink}; outline-offset: 1px; }
        ::placeholder { color: #aca6c6; }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
      `}</style>

      {/* ---------- header ---------- */}
      <header style={{ borderBottom: `1px solid ${C.line}`, background: C.card }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "16px 24px", display: "flex", alignItems: "baseline", gap: 20, flexWrap: "wrap" }}>
          <div style={{ fontFamily: C.serif, fontSize: 22, fontWeight: 800, letterSpacing: "0.01em", color: C.green }}>
            The Wire<span style={{ color: C.pink }}>.</span>
          </div>
          <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.inkSoft, letterSpacing: "0.08em" }}>
            TCFP · CLIENT INTELLIGENCE · PROTOTYPE v0.1 — PRE-SCOPE · TEST DATA ONLY
          </div>
          <nav style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            {[
              ["clients", "Clients"],
              ["cross", "Cross-client"],
              ["tasks", "Tasks"],
              ["ops", "Operations"],
            ].map(([p, label]) => (
              <button
                key={p}
                onClick={() => setView({ page: p })}
                style={{
                  fontFamily: C.sans, fontSize: 13, fontWeight: 600, padding: "6px 14px",
                  borderRadius: 4, cursor: "pointer",
                  background: view.page === p || (p === "clients" && view.page === "client") ? C.green : "transparent",
                  color: view.page === p || (p === "clients" && view.page === "client") ? "#fff" : C.inkSoft,
                  border: `1px solid ${view.page === p || (p === "clients" && view.page === "client") ? C.green : "transparent"}`,
                }}
              >
                {label}
              </button>
            ))}
          </nav>
          <div style={{ fontFamily: C.mono, fontSize: 10, color: saveState === "error" ? C.red : C.inkSoft }}>
            {saveState === "saving" ? "saving…" : saveState === "saved" ? "saved" : saveState === "error" ? "save failed" : ""}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px 80px" }}>
        {view.page === "clients" && (
          <ClientsPage
            data={data}
            openClient={(id) => setView({ page: "client", id, tab: "living" })}
            resetData={resetData}
            clearAll={clearAll}
            addClient={addClient}
            importJson={importJson}
          />
        )}
        {view.page === "client" && activeClient && (
          <ClientPage
            client={activeClient}
            tab={view.tab || "living"}
            setTab={(tab) => setView((v) => ({ ...v, tab }))}
            back={() => setView({ page: "clients" })}
            update={(fn) => updateClient(activeClient.id, fn)}
          />
        )}
        {view.page === "cross" && <CrossPage data={data} openClient={(id) => setView({ page: "client", id, tab: "living" })} />}
        {view.page === "tasks" && <TasksPage data={data} updateClient={updateClient} openClient={(id) => setView({ page: "client", id, tab: "tasks" })} />}
        {view.page === "ops" && <OpsPage data={data} updateClient={updateClient} openClient={(id) => setView({ page: "client", id, tab: "living" })} />}
      </main>
    </div>
  );
}

/* ============================================================
   CLIENTS — searchable CRM-lite
   ============================================================ */
function ClientsPage({ data, openClient, resetData, clearAll, addClient, importJson }) {
  const [q, setQ] = useState("");
  const [decade, setDecade] = useState(null);
  const [status, setStatus] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showData, setShowData] = useState(false);
  const [form, setForm] = useState({ firstName: "", surname: "", dob: "", email: "", phone: "", status: "Working", adviser: "", cm: "" });
  const [pasted, setPasted] = useState("");
  const [importMsg, setImportMsg] = useState(null);

  const submitAdd = () => {
    if (!form.firstName.trim()) return;
    addClient({ ...form, firstName: form.firstName.trim(), surname: form.surname.trim() });
  };

  const doImport = () => {
    const err = importJson(pasted);
    setImportMsg(err || "Imported. The spine is live.");
    if (!err) { setPasted(""); setShowData(false); }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `the-wire-export-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const results = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return data.clients.filter((c) => {
      const age = ageFrom(c.dob);
      if (decade != null && decadeOf(age) !== decade) return false;
      if (status && c.status !== status) return false;
      if (!ql) return true;
      const hay = [
        c.firstName, c.surname, c.email, c.phone, c.status, c.adviser, c.cm,
        ...c.softFacts.map((s) => s.text),
        ...c.points.map((p) => p.text),
        c.portfolio.summary,
      ].join(" ").toLowerCase();
      return hay.includes(ql);
    });
  }, [data, q, decade, status]);

  const decades = [...new Set(data.clients.map((c) => decadeOf(ageFrom(c.dob))).filter((d) => d != null))].sort((a, b) => a - b);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap", marginBottom: 18 }}>
        <h1 style={{ fontFamily: C.serif, fontSize: 26, margin: 0 }}>Clients</h1>
        <span style={{ fontFamily: C.mono, fontSize: 11, color: C.inkSoft }}>
          {data.clients.length} {data.clients.length === 1 ? "family" : "families"} · searches names, soft facts, points, portfolio
        </span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <Btn tone="green" small onClick={() => { setShowAdd((v) => !v); setShowData(false); }}>+ Add client</Btn>
          <Btn tone="ghost" small onClick={() => { setShowData((v) => !v); setShowAdd(false); }}>Data</Btn>
        </span>
      </div>

      {showAdd && (
        <Card style={{ marginBottom: 18 }}>
          <Eyebrow color={C.green}>New client — basic facts; everything else lives in their Living Document</Eyebrow>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 8, marginBottom: 10 }}>
            <Input placeholder="First name(s)" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            <Input placeholder="Surname" value={form.surname} onChange={(e) => setForm({ ...form, surname: e.target.value })} />
            <Input placeholder="Date of birth" type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} />
            <Input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Input placeholder="Adviser" value={form.adviser} onChange={(e) => setForm({ ...form, adviser: e.target.value })} />
            <Input placeholder="Client Manager" value={form.cm} onChange={(e) => setForm({ ...form, cm: e.target.value })} />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {["Working", "Retired"].map((s) => (
              <Pill key={s} tone="plain" active={form.status === s} onClick={() => setForm({ ...form, status: s })}>{s}</Pill>
            ))}
            <Btn tone="green" small onClick={submitAdd}>Create client</Btn>
          </div>
        </Card>
      )}

      {showData && (
        <Card style={{ marginBottom: 18 }}>
          <Eyebrow color={C.green}>Data — import from the moneyinfo sync, export, or clear</Eyebrow>
          <div style={{ fontSize: 12.5, color: C.inkSoft, marginBottom: 10, lineHeight: 1.55 }}>
            Paste JSON in the Wire shape — {"{ \"clients\": [...] }"} — produced by the sync script. Importing replaces what's here, so export first if you need a copy.
          </div>
          <TextArea rows={5} placeholder='{"clients": [ ... ]}' value={pasted} onChange={(e) => setPasted(e.target.value)} style={{ fontFamily: C.mono, fontSize: 11.5 }} />
          <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Btn tone="green" small onClick={doImport}>Import</Btn>
            <Btn tone="ghost" small onClick={exportJson}>Export JSON</Btn>
            <Btn tone="ghost" small onClick={() => { if (confirm("Load the TESTCLIENT example data? This replaces current data.")) resetData(); }}>Load example data</Btn>
            <Btn tone="ghost" small onClick={() => { if (confirm("Remove ALL data from The Wire? Export first if you need a copy.")) clearAll(); }}>Clear all data</Btn>
            {importMsg && <span style={{ fontFamily: C.mono, fontSize: 11, color: importMsg.startsWith("Imported") ? C.green : C.red }}>{importMsg}</span>}
          </div>
        </Card>
      )}

      {data.clients.length === 0 && !showAdd && (
        <Card style={{ marginBottom: 18, textAlign: "center", padding: 36 }}>
          <div style={{ fontFamily: C.serif, fontSize: 20, fontWeight: 700, color: C.green, marginBottom: 8 }}>The spine is empty</div>
          <div style={{ fontSize: 13, color: C.inkSoft, marginBottom: 16, lineHeight: 1.6 }}>
            Add your first client, import real data from the moneyinfo sync, or load the TESTCLIENT examples to explore.
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <Btn tone="green" onClick={() => setShowAdd(true)}>+ Add client</Btn>
            <Btn tone="ghost" onClick={() => setShowData(true)}>Import data</Btn>
            <Btn tone="ghost" onClick={resetData}>Load example data</Btn>
          </div>
        </Card>
      )}

      {data.clients.length > 0 && (<>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 20 }}>
        <div style={{ flex: "1 1 320px" }}>
          <Input placeholder='Search — a name, an interest, "ISA", anything in the spine…' value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {decades.map((d) => (
          <Pill key={d} tone="green" active={decade === d} onClick={() => setDecade(decade === d ? null : d)}>
            in their {d}s
          </Pill>
        ))}
        {["Working", "Retired"].map((s) => (
          <Pill key={s} tone="plain" active={status === s} onClick={() => setStatus(status === s ? null : s)}>
            {s}
          </Pill>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 14 }}>
        {results.map((c) => {
          const age = ageFrom(c.dob);
          const carried = c.points.filter((p) => p.status !== "resolved").length;
          const senseTasks = c.tasks.filter((t) => t.status === "sense").length;
          const du = daysUntil(c.nextMeeting?.date);
          return (
            <Card key={c.id} style={{ cursor: "pointer", padding: 18 }} >
              <div onClick={() => openClient(c.id)}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <div style={{ fontFamily: C.serif, fontSize: 19, fontWeight: 700 }}>{c.firstName} {c.surname}</div>
                </div>
                <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.inkSoft, margin: "4px 0 12px" }}>
                  {age} · {c.status} · Adviser {c.adviser} · CM {c.cm}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                  {c.nextMeeting?.date && (
                    <Pill tone={du != null && du <= 14 ? "amber" : "green"}>
                      {c.nextMeeting.type} · {fmtDate(c.nextMeeting.date)}{du != null && du >= 0 ? ` · in ${du}d` : ""}
                    </Pill>
                  )}
                  {carried > 0 && <Pill tone="plain">{carried} open point{carried > 1 ? "s" : ""}</Pill>}
                  {senseTasks > 0 && <Pill tone="amber">{senseTasks} awaiting sense-check</Pill>}
                </div>
                <div style={{ fontSize: 12.5, color: C.inkSoft, lineHeight: 1.5, borderTop: `1px solid ${C.line}`, paddingTop: 10 }}>
                  <span style={{ fontFamily: C.mono, fontSize: 9.5, letterSpacing: "0.1em", color: C.green }}>LATEST SOFT FACT · </span>
                  {c.softFacts[0] ? c.softFacts[0].text : "None yet — if the Living Document isn't current, we don't properly know this client."}
                </div>
              </div>
            </Card>
          );
        })}
        {results.length === 0 && (
          <Card><div style={{ fontSize: 13, color: C.inkSoft }}>No clients match. Clear a filter or try a different word.</div></Card>
        )}
      </div>
      </>)}
    </div>
  );
}

/* ============================================================
   CLIENT PAGE — Living Document (the spine), Prep, Tasks
   ============================================================ */
function ClientPage({ client, tab, setTab, back, update }) {
  const age = ageFrom(client.dob);
  const du = daysUntil(client.nextMeeting?.date);
  return (
    <div>
      <button onClick={back} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: C.mono, fontSize: 11, color: C.inkSoft, padding: 0, marginBottom: 14 }}>
        ← all clients
      </button>

      <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
        <h1 style={{ fontFamily: C.serif, fontSize: 28, margin: 0 }}>{client.firstName} {client.surname}</h1>
        <span style={{ fontFamily: C.mono, fontSize: 11, color: C.inkSoft }}>
          {age} · {client.status} · Adviser {client.adviser} · CM {client.cm} · {client.email} · {client.phone}
        </span>
      </div>

      <div style={{ margin: "10px 0 22px", display: "flex", gap: 8, flexWrap: "wrap" }}>
        {client.nextMeeting?.date && (
          <Pill tone={du != null && du <= 14 ? "amber" : "green"}>
            Next: {client.nextMeeting.type} · {fmtDate(client.nextMeeting.date)}{du != null && du >= 0 ? ` · in ${du} days` : ""}
          </Pill>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, borderBottom: `1px solid ${C.line}`, marginBottom: 24 }}>
        {[["living", "Living Document"], ["prep", "Meeting prep"], ["tasks", `Tasks (${client.tasks.length})`]].map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              fontFamily: C.sans, fontSize: 13, fontWeight: 600, padding: "8px 16px", cursor: "pointer",
              background: "none", border: "none", borderBottom: tab === t ? `2px solid ${C.green}` : "2px solid transparent",
              color: tab === t ? C.green : C.inkSoft, marginBottom: -1,
            }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "living" && <LivingDocument client={client} update={update} />}
      {tab === "prep" && <PrepView client={client} update={update} goLiving={() => setTab("living")} />}
      {tab === "tasks" && <ClientTasks client={client} update={update} />}
    </div>
  );
}

/* ---------------- The spine itself ---------------- */
function SpineSection({ n, title, note, children, tone = "green" }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "34px 1fr", gap: 0, position: "relative" }}>
      {/* rail */}
      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", left: 13, top: 0, bottom: 0, width: 2, background: C.greenLine }} />
        <div style={{
          position: "relative", width: 28, height: 28, borderRadius: "50%",
          background: tone === "amber" ? C.yellow : C.greenSoft,
          border: `2px solid ${tone === "amber" ? "#4a3a86" : C.green}`,
          color: tone === "amber" ? "#342562" : C.green,
          fontFamily: C.serif, fontWeight: 700, fontSize: 14,
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1, marginTop: 2,
        }}>{n}</div>
      </div>
      <div style={{ paddingBottom: 34 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <h2 style={{ fontFamily: C.serif, fontSize: 19, margin: "0 0 2px" }}>{title}</h2>
          <span style={{ fontFamily: C.mono, fontSize: 10, color: C.inkSoft, letterSpacing: "0.06em" }}>{note}</span>
        </div>
        <div style={{ marginTop: 12 }}>{children}</div>
      </div>
    </div>
  );
}

function LivingDocument({ client, update }) {
  const [newFact, setNewFact] = useState("");
  const [newPoint, setNewPoint] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [noteType, setNoteType] = useState(client.nextMeeting?.type || "Annual");
  const [newLog, setNewLog] = useState("");
  const [resolving, setResolving] = useState({}); // id -> text

  const addFact = () => {
    if (!newFact.trim()) return;
    update((c) => ({ ...c, softFacts: [{ id: uid(), date: today(), text: newFact.trim() }, ...c.softFacts] }));
    setNewFact("");
  };
  const addPoint = () => {
    if (!newPoint.trim()) return;
    update((c) => ({
      ...c,
      points: [...c.points, { id: uid(), num: Math.max(0, ...c.points.map((p) => p.num)) + 1, text: newPoint.trim(), status: "open", resolution: "", from: `Added ${fmtDate(today())}` }],
    }));
    setNewPoint("");
  };
  const resolvePoint = (id, carried) => {
    const text = (resolving[id] || "").trim();
    update((c) => ({
      ...c,
      points: c.points.map((p) =>
        p.id === id ? { ...p, status: carried ? "carried" : "resolved", resolution: text || (carried ? "Carry forward to next meeting." : "Resolved.") } : p
      ),
    }));
    setResolving((r) => ({ ...r, [id]: "" }));
  };
  const reopenPoint = (id) => update((c) => ({ ...c, points: c.points.map((p) => (p.id === id ? { ...p, status: "open" } : p)) }));

  const saveNote = () => {
    if (!noteDraft.trim()) return;
    const note = { id: uid(), date: today(), type: noteType, text: noteDraft.trim() };
    // extract candidate actions → tasks awaiting sense-check (wishlist: auto-create, human sense checks)
    const actionLines = noteDraft.split("\n").filter((l) => /^(tcfp|client)\s*:/i.test(l.trim()));
    const newTasks = actionLines.map((l) => ({
      id: uid(),
      text: l.trim().replace(/^tcfp\s*:\s*/i, "").replace(/^client\s*:\s*/i, "Client action — "),
      owner: /^client/i.test(l.trim()) ? client.cm + " (follow up)" : client.cm,
      due: "",
      status: "sense",
    })).filter((t) => t.text);
    update((c) => ({ ...c, meetingNotes: [note, ...c.meetingNotes], tasks: [...c.tasks, ...newTasks] }));
    setNoteDraft("");
  };

  const addLog = () => {
    if (!newLog.trim()) return;
    update((c) => ({ ...c, portfolio: { ...c.portfolio, logs: [{ id: uid(), date: today(), text: newLog.trim() }, ...c.portfolio.logs] } }));
    setNewLog("");
  };

  const statusTone = { open: "plain", carried: "amber", resolved: "green" };

  return (
    <div>
      <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.inkSoft, marginBottom: 18, letterSpacing: "0.04em" }}>
        THE SPINE · four sections, always this order — the human comes first, the technical comes last.
      </div>

      {/* 1 — Soft facts */}
      <SpineSection n="1" title="Soft facts" note="the human intelligence · adviser writes · newest first">
        <Card>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <Input placeholder="Add a soft fact — the things a thoughtful friend would remember…" value={newFact}
              onChange={(e) => setNewFact(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addFact()} />
            <Btn tone="green" onClick={addFact}>Add</Btn>
          </div>
          {client.softFacts.length === 0 && (
            <div style={{ fontSize: 12.5, color: C.inkSoft, fontStyle: "italic" }}>
              Empty. The test: could another adviser read this document tomorrow and know who this client is — not just what they own?
            </div>
          )}
          {client.softFacts.map((s) => (
            <div key={s.id} style={{ display: "flex", gap: 12, padding: "8px 0", borderTop: `1px solid ${C.line}`, fontSize: 13, lineHeight: 1.55 }}>
              <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.inkSoft, whiteSpace: "nowrap", paddingTop: 2 }}>{fmtDate(s.date)}</span>
              <span>{s.text}</span>
            </div>
          ))}
        </Card>
      </SpineSection>

      {/* 2 — Points to note */}
      <SpineSection n="2" title="Points to note / discuss" note="running agenda + carry-forwards · nothing disappears without being closed" tone="amber">
        <Card>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <Input placeholder="Add a point to watch or raise — the +1 thinking lives here…" value={newPoint}
              onChange={(e) => setNewPoint(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addPoint()} />
            <Btn tone="green" onClick={addPoint}>Add</Btn>
          </div>
          {client.points.map((p) => (
            <div key={p.id} style={{ borderTop: `1px solid ${C.line}`, padding: "10px 0" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                <span style={{ fontFamily: C.serif, fontWeight: 700, fontSize: 14, color: C.ink }}>{p.num}.</span>
                <span style={{ fontSize: 13, flex: 1, minWidth: 200, textDecoration: p.status === "resolved" ? "line-through" : "none", color: p.status === "resolved" ? C.inkSoft : C.ink }}>{p.text}</span>
                <Pill tone={statusTone[p.status]}>{p.status === "carried" ? "carried forward" : p.status}</Pill>
              </div>
              <div style={{ fontFamily: C.mono, fontSize: 10, color: C.inkSoft, margin: "4px 0 0 22px" }}>{p.from}</div>
              {p.resolution && (
                <div style={{ margin: "6px 0 0 22px", fontSize: 12.5, color: p.status === "resolved" ? C.green : C.amber, fontStyle: "italic" }}>
                  [Resolution: {p.resolution}]
                </div>
              )}
              {p.status !== "resolved" ? (
                <div style={{ display: "flex", gap: 8, margin: "8px 0 0 22px", flexWrap: "wrap" }}>
                  <Input placeholder="Resolution note…" value={resolving[p.id] || ""} onChange={(e) => setResolving((r) => ({ ...r, [p.id]: e.target.value }))} style={{ maxWidth: 340 }} />
                  <Btn small tone="green" onClick={() => resolvePoint(p.id, false)}>Resolve</Btn>
                  <Btn small tone="ghost" onClick={() => resolvePoint(p.id, true)}>Carry forward</Btn>
                </div>
              ) : (
                <div style={{ margin: "6px 0 0 22px" }}>
                  <Btn small tone="ghost" onClick={() => reopenPoint(p.id)}>Reopen</Btn>
                </div>
              )}
            </div>
          ))}
        </Card>
      </SpineSection>

      {/* 3 — Meeting Note */}
      <SpineSection n="3" title="Meeting Note" note="the only section the client sees · calm, plain English · posted via portal by CM">
        <Card>
          <Eyebrow color={C.green}>Write this meeting's note</Eyebrow>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            {["Annual", "Interim", "Ad hoc"].map((t) => (
              <Pill key={t} tone="plain" active={noteType === t} onClick={() => setNoteType(t)}>{t}</Pill>
            ))}
          </div>
          <TextArea rows={8} value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)}
            placeholder={"Sections as relevant: Overall position · Cash flow & spending · Pension contributions · Income & tax · Investments & allowances · Family gifting · Estate planning · Next steps & actions.\n\nLines starting \u201CTCFP:\u201D or \u201CClient:\u201D become draft tasks for a human to sense-check."} />
          <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Btn tone="green" onClick={saveNote}>Save note & draft tasks</Btn>
            <span style={{ fontFamily: C.mono, fontSize: 10, color: C.amber }}>action lines → tasks marked "awaiting sense-check" — nothing goes to Asana unchecked</span>
          </div>

          {client.meetingNotes.length > 0 && (
            <div style={{ marginTop: 22 }}>
              <Eyebrow>Previous notes — the starting reference for next meeting's prep</Eyebrow>
              {client.meetingNotes.map((m) => (
                <div key={m.id} style={{ borderTop: `1px solid ${C.line}`, padding: "12px 0" }}>
                  <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.green, marginBottom: 6 }}>{m.type.toUpperCase()} · {fmtDate(m.date)}</div>
                  <div style={{ fontFamily: C.serif, fontSize: 13.5, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{m.text}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </SpineSection>

      {/* 4 — Portfolio detail */}
      <SpineSection n="4" title="Portfolio detail" note="the technical layer · adviser refreshes before each meeting · CM logs completions">
        <Card>
          <Eyebrow color={C.green}>Position summary</Eyebrow>
          <TextArea rows={3} value={client.portfolio.summary}
            onChange={(e) => { const v = e.target.value; update((c) => ({ ...c, portfolio: { ...c.portfolio, summary: v } })); }} />
          <div style={{ marginTop: 16 }}>
            <Eyebrow>Completion log — what has happened since the adviser last looked</Eyebrow>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <Input placeholder='e.g. "£20k withdrawal sent from JB GIA on…"' value={newLog}
                onChange={(e) => setNewLog(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addLog()} />
              <Btn tone="green" onClick={addLog}>Log</Btn>
            </div>
            {client.portfolio.logs.map((l) => (
              <div key={l.id} style={{ display: "flex", gap: 12, padding: "7px 0", borderTop: `1px solid ${C.line}`, fontSize: 13 }}>
                <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.inkSoft, whiteSpace: "nowrap" }}>{fmtDate(l.date)}</span>
                <span>{l.text}</span>
              </div>
            ))}
            {client.portfolio.logs.length === 0 && <div style={{ fontSize: 12.5, color: C.inkSoft, fontStyle: "italic" }}>Nothing logged yet.</div>}
          </div>
        </Card>
      </SpineSection>
    </div>
  );
}

/* ---------------- Prep view ---------------- */
function PrepView({ client, update, goLiving }) {
  const open = client.points.filter((p) => p.status !== "resolved");
  const recentFacts = client.softFacts.slice(0, 4);
  const lastNote = client.meetingNotes[0];
  const outstanding = client.tasks.filter((t) => t.status !== "done");
  const du = daysUntil(client.nextMeeting?.date);

  const infoRequestDraft = useMemo(() => {
    const first = client.firstName.split("&")[0].trim();
    return `Dear ${first},\n\nAhead of your ${client.nextMeeting?.type || "review"} meeting on ${fmtDate(client.nextMeeting?.date)}, it would help us to have a quick update on anything that has changed since we last spoke — income, spending, family, plans, or anything on your mind.\n\nThere is nothing to prepare beyond that. We will bring everything else.\n\nKind regards,\n${client.adviser}`;
  }, [client]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 16 }}>
      <Card style={{ gridColumn: "1/-1", background: C.greenSoft, border: `1px solid ${C.greenLine}` }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
          <div style={{ fontFamily: C.serif, fontSize: 18, fontWeight: 700, color: C.green }}>
            {client.nextMeeting?.type || "Meeting"} · {fmtDate(client.nextMeeting?.date)}{du != null && du >= 0 ? ` · in ${du} days` : ""}
          </div>
          <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.green }}>
            assembled from the Living Document — walk in with the full picture, zero hunting
          </div>
        </div>
      </Card>

      <Card>
        <Eyebrow color={C.amber}>Carry-forwards & open points ({open.length})</Eyebrow>
        {open.length === 0 && <div style={{ fontSize: 13, color: C.inkSoft }}>Nothing carried. A quiet file can represent excellent advice.</div>}
        {open.map((p) => (
          <div key={p.id} style={{ padding: "8px 0", borderTop: `1px solid ${C.line}`, fontSize: 13, lineHeight: 1.5 }}>
            <span style={{ fontFamily: C.serif, fontWeight: 700 }}>{p.num}.</span> {p.text}
            <div style={{ fontFamily: C.mono, fontSize: 10, color: C.inkSoft, marginTop: 3 }}>{p.from}{p.status === "carried" ? " · previously carried" : ""}</div>
          </div>
        ))}
        <div style={{ marginTop: 10 }}><Btn small tone="ghost" onClick={goLiving}>Open in Living Document</Btn></div>
      </Card>

      <Card>
        <Eyebrow color={C.green}>Recent soft facts — bring the client back to mind</Eyebrow>
        {recentFacts.map((s) => (
          <div key={s.id} style={{ padding: "8px 0", borderTop: `1px solid ${C.line}`, fontSize: 13, lineHeight: 1.5 }}>
            <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.inkSoft, marginRight: 8 }}>{fmtDate(s.date)}</span>
            {s.text}
          </div>
        ))}
        {recentFacts.length === 0 && <div style={{ fontSize: 13, color: C.inkSoft }}>No soft facts yet — the section that takes years to build and minutes to update.</div>}
      </Card>

      <Card>
        <Eyebrow>Portfolio snapshot</Eyebrow>
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>{client.portfolio.summary || "Not yet refreshed — adviser updates this before each meeting."}</div>
        {client.portfolio.logs[0] && (
          <div style={{ marginTop: 10, fontSize: 12.5, color: C.inkSoft }}>
            <span style={{ fontFamily: C.mono, fontSize: 9.5, letterSpacing: "0.1em", color: C.green }}>SINCE YOU LAST LOOKED · </span>
            {client.portfolio.logs[0].text} ({fmtDate(client.portfolio.logs[0].date)})
          </div>
        )}
      </Card>

      <Card>
        <Eyebrow color={C.amber}>Outstanding actions ({outstanding.length})</Eyebrow>
        {outstanding.map((t) => (
          <div key={t.id} style={{ padding: "7px 0", borderTop: `1px solid ${C.line}`, fontSize: 13, display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
            <span style={{ flex: 1, minWidth: 180 }}>{t.text}</span>
            <Pill tone={t.status === "sense" ? "amber" : "green"}>{t.status === "sense" ? "sense-check" : "confirmed"}</Pill>
          </div>
        ))}
        {outstanding.length === 0 && <div style={{ fontSize: 13, color: C.inkSoft }}>All clear.</div>}
      </Card>

      {lastNote && (
        <Card style={{ gridColumn: "1/-1" }}>
          <Eyebrow>Last Meeting Note — {lastNote.type} · {fmtDate(lastNote.date)}</Eyebrow>
          <div style={{ fontFamily: C.serif, fontSize: 13.5, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{lastNote.text}</div>
        </Card>
      )}

      <Card style={{ gridColumn: "1/-1" }}>
        <Eyebrow color={C.green}>Draft info request to client — hand-finish before sending</Eyebrow>
        <div style={{ fontFamily: C.serif, fontSize: 13.5, lineHeight: 1.7, whiteSpace: "pre-wrap", background: "#fff", border: `1px dashed ${C.line}`, borderRadius: 4, padding: 14 }}>
          {infoRequestDraft}
        </div>
      </Card>

      <Card style={{ gridColumn: "1/-1", background: C.card, borderColor: C.greenLine }}>
        <Eyebrow color={C.green}>The 1-minute reset — sit with these before you join the room</Eyebrow>
        <div style={{ fontFamily: C.serif, fontStyle: "italic", fontSize: 14.5, lineHeight: 2, color: C.ink }}>
          Am I clear on who this client is — not just their numbers?<br />
          What has been heavy for them recently, even if nothing changed?<br />
          Am I open to this meeting ending without a decision?<br />
          Am I here to listen first, not lead with solutions?
        </div>
      </Card>
    </div>
  );
}

/* ---------------- Tasks (per client) ---------------- */
function ClientTasks({ client, update }) {
  const [text, setText] = useState("");
  const [owner, setOwner] = useState(client.cm);

  const add = () => {
    if (!text.trim()) return;
    update((c) => ({ ...c, tasks: [...c.tasks, { id: uid(), text: text.trim(), owner: owner || c.cm, due: "", status: "sense" }] }));
    setText("");
  };
  const setStatus = (id, status) => update((c) => ({ ...c, tasks: c.tasks.map((t) => (t.id === id ? { ...t, status } : t)) }));
  const remove = (id) => update((c) => ({ ...c, tasks: c.tasks.filter((t) => t.id !== id) }));

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Eyebrow color={C.amber}>New tasks start as "awaiting sense-check" — a human confirms before anything is sent to Asana</Eyebrow>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Input placeholder="Task…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} style={{ flex: "1 1 260px" }} />
          <Input placeholder="Owner" value={owner} onChange={(e) => setOwner(e.target.value)} style={{ width: 130 }} />
          <Btn tone="green" onClick={add}>Add</Btn>
        </div>
      </Card>
      <TaskList tasks={client.tasks} setStatus={setStatus} remove={remove} />
    </div>
  );
}

function TaskList({ tasks, setStatus, remove }) {
  const order = { sense: 0, confirmed: 1, done: 2 };
  const sorted = [...tasks].sort((a, b) => order[a.status] - order[b.status]);
  return (
    <Card>
      {sorted.length === 0 && <div style={{ fontSize: 13, color: C.inkSoft }}>No tasks. If something matters, it must be visible and owned.</div>}
      {sorted.map((t) => (
        <div key={t.id} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "9px 0", borderTop: `1px solid ${C.line}`, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, flex: 1, minWidth: 200, textDecoration: t.status === "done" ? "line-through" : "none", color: t.status === "done" ? C.inkSoft : C.ink }}>{t.text}</span>
          <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.inkSoft }}>{t.owner}{t.due ? ` · due ${fmtDate(t.due)}` : ""}</span>
          <Pill tone={t.status === "sense" ? "amber" : t.status === "confirmed" ? "green" : "plain"}>
            {t.status === "sense" ? "awaiting sense-check" : t.status === "confirmed" ? "confirmed → Asana" : "done"}
          </Pill>
          {t.status === "sense" && <Btn small tone="green" onClick={() => setStatus(t.id, "confirmed")}>Confirm</Btn>}
          {t.status === "confirmed" && <Btn small tone="ghost" onClick={() => setStatus(t.id, "done")}>Mark done</Btn>}
          <Btn small tone="ghost" onClick={() => remove(t.id)}>Remove</Btn>
        </div>
      ))}
    </Card>
  );
}

/* ============================================================
   CROSS-CLIENT — "get lists of stuff out"
   ============================================================ */
function CrossPage({ data, openClient }) {
  const [q, setQ] = useState("");
  const [decade, setDecade] = useState(null);
  const [status, setStatus] = useState(null);

  const decades = [...new Set(data.clients.map((c) => decadeOf(ageFrom(c.dob))))].sort((a, b) => a - b);

  const results = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return data.clients
      .map((c) => {
        const age = ageFrom(c.dob);
        if (decade != null && decadeOf(age) !== decade) return null;
        if (status && c.status !== status) return null;
        const matches = [];
        if (ql) {
          c.softFacts.forEach((s) => { if (s.text.toLowerCase().includes(ql)) matches.push({ where: "Soft fact", date: s.date, text: s.text }); });
          c.points.forEach((p) => { if (p.text.toLowerCase().includes(ql)) matches.push({ where: "Point", date: null, text: p.text }); });
          c.meetingNotes.forEach((m) => { if (m.text.toLowerCase().includes(ql)) matches.push({ where: `Meeting Note (${m.type})`, date: m.date, text: "…" + excerpt(m.text, ql) + "…" }); });
          if (c.portfolio.summary.toLowerCase().includes(ql)) matches.push({ where: "Portfolio", date: null, text: excerpt(c.portfolio.summary, ql) });
          if ((c.firstName + " " + c.surname).toLowerCase().includes(ql)) matches.push({ where: "Name", date: null, text: c.firstName + " " + c.surname });
          if (matches.length === 0) return null;
        }
        return { client: c, age, matches };
      })
      .filter(Boolean);
  }, [data, q, decade, status]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap", marginBottom: 6 }}>
        <h1 style={{ fontFamily: C.serif, fontSize: 26, margin: 0 }}>Cross-client</h1>
        <span style={{ fontFamily: C.mono, fontSize: 11, color: C.inkSoft }}>soft facts, hard facts, notes — across every family at once</span>
      </div>
      <div style={{ fontSize: 12.5, color: C.inkSoft, marginBottom: 16 }}>
        Try: an interest ("choir", "running"), a theme ("gifting", "ISA"), or just filter by decade for a list.
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 22 }}>
        <div style={{ flex: "1 1 300px" }}>
          <Input placeholder="Keyword across all Living Documents…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {decades.map((d) => (
          <Pill key={d} tone="green" active={decade === d} onClick={() => setDecade(decade === d ? null : d)}>in their {d}s</Pill>
        ))}
        {["Working", "Retired"].map((s) => (
          <Pill key={s} tone="plain" active={status === s} onClick={() => setStatus(status === s ? null : s)}>{s}</Pill>
        ))}
      </div>

      <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.inkSoft, marginBottom: 10 }}>
        {results.length} client{results.length !== 1 ? "s" : ""} match
      </div>

      {results.map(({ client: c, age, matches }) => (
        <Card key={c.id} style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", cursor: "pointer" }} onClick={() => openClient(c.id)}>
            <span style={{ fontFamily: C.serif, fontSize: 17, fontWeight: 700 }}>{c.firstName} {c.surname}</span>
            <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.inkSoft }}>{age} · {c.status} · Adviser {c.adviser}</span>
          </div>
          {matches.map((m, i) => (
            <div key={i} style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.55, borderTop: `1px solid ${C.line}`, paddingTop: 8 }}>
              <span style={{ fontFamily: C.mono, fontSize: 9.5, letterSpacing: "0.1em", color: C.green }}>{m.where.toUpperCase()}{m.date ? " · " + fmtDate(m.date) : ""} · </span>
              {m.text}
            </div>
          ))}
        </Card>
      ))}
      {results.length === 0 && <Card><div style={{ fontSize: 13, color: C.inkSoft }}>Nothing matches yet. Broaden the search or clear a filter.</div></Card>}
    </div>
  );
}

function excerpt(text, q) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text.slice(0, 120);
  return text.slice(Math.max(0, i - 50), i + q.length + 70).replace(/\n/g, " ");
}

/* ============================================================
   TASKS — firm-wide view, sense-check gate first
   ============================================================ */
function TasksPage({ data, updateClient, openClient }) {
  const [owner, setOwner] = useState(null);
  const [lens, setLens] = useState("all"); // all | today | overdue

  const allRaw = data.clients.flatMap((c) => c.tasks.map((t) => ({ ...t, client: c })));
  const owners = [...new Set(allRaw.map((t) => t.owner).filter(Boolean))].sort();

  const all = allRaw.filter((t) => {
    if (owner && t.owner !== owner) return false;
    const du = daysUntil(t.due);
    if (lens === "today" && !(du === 0)) return false;
    if (lens === "overdue" && !(du != null && du < 0 && t.status !== "done")) return false;
    return true;
  });

  const sense = all.filter((t) => t.status === "sense");
  const confirmed = all.filter((t) => t.status === "confirmed");
  const done = all.filter((t) => t.status === "done");
  const overdueCount = allRaw.filter((t) => { const du = daysUntil(t.due); return du != null && du < 0 && t.status !== "done"; }).length;
  const todayCount = allRaw.filter((t) => daysUntil(t.due) === 0 && t.status !== "done").length;

  const setStatus = (clientId, taskId, status) =>
    updateClient(clientId, (c) => ({ ...c, tasks: c.tasks.map((t) => (t.id === taskId ? { ...t, status } : t)) }));
  const setOwnerOn = (clientId, taskId, val) =>
    updateClient(clientId, (c) => ({ ...c, tasks: c.tasks.map((t) => (t.id === taskId ? { ...t, owner: val } : t)) }));
  const setDue = (clientId, taskId, val) =>
    updateClient(clientId, (c) => ({ ...c, tasks: c.tasks.map((t) => (t.id === taskId ? { ...t, due: val } : t)) }));

  const Group = ({ title, note, items, tone, action }) => (
    <div style={{ marginBottom: 26 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
        <h2 style={{ fontFamily: C.serif, fontSize: 18, margin: 0 }}>{title}</h2>
        <span style={{ fontFamily: C.mono, fontSize: 10.5, color: tone }}>{note}</span>
      </div>
      <Card>
        {items.length === 0 && <div style={{ fontSize: 13, color: C.inkSoft }}>None.</div>}
        {items.map((t) => {
          const du = daysUntil(t.due);
          const late = du != null && du < 0 && t.status !== "done";
          return (
            <div key={t.client.id + t.id} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "9px 0", borderTop: `1px solid ${C.line}`, flexWrap: "wrap" }}>
              <span onClick={() => openClient(t.client.id)} style={{ fontFamily: C.serif, fontWeight: 700, fontSize: 13, cursor: "pointer", color: C.green, whiteSpace: "nowrap" }}>
                {t.client.firstName} {t.client.surname}
              </span>
              <span style={{ fontSize: 13, flex: 1, minWidth: 180 }}>{t.text}</span>
              <Input value={t.owner || ""} placeholder="owner" onChange={(e) => setOwnerOn(t.client.id, t.id, e.target.value)} style={{ width: 110, fontSize: 12, padding: "4px 8px" }} />
              <Input type="date" value={t.due || ""} onChange={(e) => setDue(t.client.id, t.id, e.target.value)} style={{ width: 140, fontSize: 12, padding: "4px 8px" }} />
              {late && <Pill tone="red">overdue {Math.abs(du)}d</Pill>}
              {action && action(t)}
            </div>
          );
        })}
      </Card>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap", marginBottom: 6 }}>
        <h1 style={{ fontFamily: C.serif, fontSize: 26, margin: 0 }}>Tasks</h1>
        <span style={{ fontFamily: C.mono, fontSize: 11, color: C.inkSoft }}>every action visible and owned — own it through</span>
      </div>
      <div style={{ fontSize: 12.5, color: C.inkSoft, marginBottom: 16 }}>
        Drafted tasks wait for a human to confirm before anything is sent onward. Nothing leaves unchecked.
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 20 }}>
        <Pill tone="plain" active={lens === "all"} onClick={() => setLens("all")}>All ({allRaw.length})</Pill>
        <Pill tone="green" active={lens === "today"} onClick={() => setLens("today")}>Due today ({todayCount})</Pill>
        <Pill tone="red" active={lens === "overdue"} onClick={() => setLens("overdue")}>Overdue ({overdueCount})</Pill>
        <span style={{ width: 1, height: 18, background: C.line, margin: "0 4px" }} />
        {owners.map((o) => (
          <Pill key={o} tone="plain" active={owner === o} onClick={() => setOwner(owner === o ? null : o)}>{o}</Pill>
        ))}
      </div>

      <Group
        title="Awaiting sense-check" note={`${sense.length} · human judgement needed`} items={sense} tone={C.amber}
        action={(t) => <Btn small tone="green" onClick={() => setStatus(t.client.id, t.id, "confirmed")}>Confirm</Btn>}
      />
      <Group
        title="Confirmed" note={`${confirmed.length} · would sync to Asana in the live build`} items={confirmed} tone={C.green}
        action={(t) => <Btn small tone="ghost" onClick={() => setStatus(t.client.id, t.id, "done")}>Mark done</Btn>}
      />
      <Group title="Done" note={`${done.length}`} items={done} tone={C.inkSoft} action={null} />
    </div>
  );
}

/* ============================================================
   OPERATIONS — reviews due, case pipeline, team workload
   Martine's asks 4, 7, 8, 9 — the operational spine.
   ============================================================ */
function OpsPage({ data, updateClient, openClient }) {
  const [newCase, setNewCase] = useState({ clientId: "", title: "" });

  /* --- reviews --- */
  const reviews = data.clients
    .map((c) => ({ c, du: daysUntil(c.nextMeeting?.date) }))
    .filter((r) => r.c.nextMeeting?.date)
    .sort((a, b) => (a.du ?? 9e9) - (b.du ?? 9e9));
  const overdueReviews = reviews.filter((r) => r.du != null && r.du < 0);
  const soonReviews = reviews.filter((r) => r.du != null && r.du >= 0 && r.du <= 42);
  const noReviewSet = data.clients.filter((c) => !c.nextMeeting?.date);

  /* --- cases --- */
  const cases = data.clients.flatMap((c) => (c.cases || []).map((k) => ({ ...k, client: c })));
  const byStage = STAGES.map((s) => ({ stage: s, items: cases.filter((k) => k.stage === s) }));
  const stalled = cases.filter((k) => {
    if (k.stage === "Completed") return false;
    const d = daysUntil(k.updated);
    return d != null && d < -14;
  });

  const addCase = () => {
    if (!newCase.clientId || !newCase.title.trim()) return;
    updateClient(newCase.clientId, (c) => ({
      ...c,
      cases: [...(c.cases || []), { id: uid(), title: newCase.title.trim(), stage: "Fact Find", waiting: "Us", updated: today(), owner: c.cm || "" }],
    }));
    setNewCase({ clientId: "", title: "" });
  };
  const moveCase = (clientId, caseId, stage) =>
    updateClient(clientId, (c) => ({ ...c, cases: (c.cases || []).map((k) => (k.id === caseId ? { ...k, stage, updated: today() } : k)) }));
  const setWaiting = (clientId, caseId, waiting) =>
    updateClient(clientId, (c) => ({ ...c, cases: (c.cases || []).map((k) => (k.id === caseId ? { ...k, waiting, updated: today() } : k)) }));
  const removeCase = (clientId, caseId) =>
    updateClient(clientId, (c) => ({ ...c, cases: (c.cases || []).filter((k) => k.id !== caseId) }));

  /* --- workload --- */
  const tasks = data.clients.flatMap((c) => c.tasks.map((t) => ({ ...t, client: c })));
  const people = [...new Set([...tasks.map((t) => t.owner), ...cases.map((k) => k.owner)].filter(Boolean))].sort();
  const load = people.map((p) => {
    const open = tasks.filter((t) => t.owner === p && t.status !== "done");
    const late = open.filter((t) => { const d = daysUntil(t.due); return d != null && d < 0; });
    return { person: p, open: open.length, late: late.length, cases: cases.filter((k) => k.owner === p && k.stage !== "Completed").length };
  });

  const Stat = ({ n, label, tone }) => (
    <Card style={{ padding: 16, textAlign: "center" }}>
      <div style={{ fontFamily: C.serif, fontSize: 30, fontWeight: 800, color: tone || C.green, lineHeight: 1.1 }}>{n}</div>
      <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: C.inkSoft, marginTop: 4 }}>{label}</div>
    </Card>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap", marginBottom: 6 }}>
        <h1 style={{ fontFamily: C.serif, fontSize: 26, margin: 0 }}>Operations</h1>
        <span style={{ fontFamily: C.mono, fontSize: 11, color: C.inkSoft }}>where every case sits — one place, not five systems</span>
      </div>
      <div style={{ fontSize: 12.5, color: C.inkSoft, marginBottom: 20 }}>
        Reviews, live cases and team load. Everything here is driven by the same spine — nothing is entered twice.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 12, marginBottom: 28 }}>
        <Stat n={overdueReviews.length} label="Reviews overdue" tone={overdueReviews.length ? C.red : C.green} />
        <Stat n={soonReviews.length} label="Reviews next 6wks" />
        <Stat n={cases.filter((k) => k.stage !== "Completed").length} label="Live cases" />
        <Stat n={cases.filter((k) => k.waiting === "Provider" && k.stage !== "Completed").length} label="With provider" tone={C.mauve} />
        <Stat n={cases.filter((k) => k.waiting === "Client" && k.stage !== "Completed").length} label="With client" tone={C.mauve} />
        <Stat n={stalled.length} label="Stalled 14d+" tone={stalled.length ? C.red : C.green} />
      </div>

      {/* Reviews */}
      <h2 style={{ fontFamily: C.serif, fontSize: 19, margin: "0 0 10px" }}>Reviews due</h2>
      <Card style={{ marginBottom: 28 }}>
        {reviews.length === 0 && <div style={{ fontSize: 13, color: C.inkSoft }}>No review dates set yet. Add one on a client's Living Document.</div>}
        {reviews.slice(0, 15).map(({ c, du }) => (
          <div key={c.id} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "9px 0", borderTop: `1px solid ${C.line}`, flexWrap: "wrap" }}>
            <span onClick={() => openClient(c.id)} style={{ fontFamily: C.serif, fontWeight: 700, fontSize: 13.5, cursor: "pointer", color: C.green, minWidth: 170 }}>
              {c.firstName} {c.surname}
            </span>
            <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.inkSoft, flex: 1 }}>
              {c.nextMeeting.type} · {fmtDate(c.nextMeeting.date)} · {c.reviewCycle || "Annual"} cycle · {c.adviser || "no adviser"}
            </span>
            {du < 0 ? <Pill tone="red">overdue {Math.abs(du)}d</Pill>
              : du <= 14 ? <Pill tone="amber">in {du}d — prep now</Pill>
              : <Pill tone="green">in {du}d</Pill>}
          </div>
        ))}
        {noReviewSet.length > 0 && (
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.line}`, fontSize: 12.5, color: C.amber }}>
            {noReviewSet.length} client{noReviewSet.length > 1 ? "s have" : " has"} no next review date set — the review cycle can't track them until they do.
          </div>
        )}
      </Card>

      {/* Pipeline */}
      <h2 style={{ fontFamily: C.serif, fontSize: 19, margin: "0 0 10px" }}>Case pipeline</h2>
      <Card style={{ marginBottom: 14 }}>
        <Eyebrow color={C.green}>New case</Eyebrow>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select
            value={newCase.clientId}
            onChange={(e) => setNewCase({ ...newCase, clientId: e.target.value })}
            style={{ fontFamily: C.sans, fontSize: 13, padding: "8px 10px", borderRadius: 4, border: `1px solid ${C.line}`, background: "#fff", color: C.ink, minWidth: 180 }}
          >
            <option value="">Choose client…</option>
            {data.clients.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.surname}</option>)}
          </select>
          <Input placeholder="Case — e.g. 'ISA transfer from Fidelity'" value={newCase.title} onChange={(e) => setNewCase({ ...newCase, title: e.target.value })} style={{ flex: "1 1 240px" }} />
          <Btn tone="green" onClick={addCase}>Add case</Btn>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(250px,1fr))", gap: 12, marginBottom: 28 }}>
        {byStage.map(({ stage, items }) => (
          <Card key={stage} style={{ padding: 14, opacity: items.length ? 1 : 0.6 }}>
            <div style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: stage === "Completed" ? C.mauve : C.green, marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
              <span>{stage}</span><span>{items.length}</span>
            </div>
            {items.length === 0 && <div style={{ fontSize: 12, color: C.inkSoft, fontStyle: "italic" }}>—</div>}
            {items.map((k) => {
              const idle = daysUntil(k.updated);
              return (
                <div key={k.id} style={{ borderTop: `1px solid ${C.line}`, paddingTop: 8, marginTop: 8 }}>
                  <div onClick={() => openClient(k.client.id)} style={{ fontFamily: C.serif, fontWeight: 700, fontSize: 12.5, color: C.green, cursor: "pointer" }}>
                    {k.client.firstName} {k.client.surname}
                  </div>
                  <div style={{ fontSize: 12.5, margin: "2px 0 6px", lineHeight: 1.45 }}>{k.title}</div>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                    <select
                      value={k.waiting}
                      onChange={(e) => setWaiting(k.client.id, k.id, e.target.value)}
                      style={{ fontFamily: C.mono, fontSize: 10, padding: "2px 4px", borderRadius: 3, border: `1px solid ${C.line}`, background: k.waiting === "Us" ? C.greenSoft : C.amberSoft, color: C.ink }}
                    >
                      {WAITING.map((w) => <option key={w} value={w}>with {w.toLowerCase()}</option>)}
                    </select>
                    {idle != null && idle < -14 && <Pill tone="red">stalled {Math.abs(idle)}d</Pill>}
                  </div>
                  <div style={{ display: "flex", gap: 5, marginTop: 6, flexWrap: "wrap" }}>
                    {STAGES.indexOf(k.stage) < STAGES.length - 1 && (
                      <Btn small tone="ghost" onClick={() => moveCase(k.client.id, k.id, STAGES[STAGES.indexOf(k.stage) + 1])}>Advance →</Btn>
                    )}
                    <Btn small tone="ghost" onClick={() => removeCase(k.client.id, k.id)}>×</Btn>
                  </div>
                </div>
              );
            })}
          </Card>
        ))}
      </div>

      {/* Workload */}
      <h2 style={{ fontFamily: C.serif, fontSize: 19, margin: "0 0 10px" }}>Team workload</h2>
      <Card>
        {load.length === 0 && <div style={{ fontSize: 13, color: C.inkSoft }}>No owners assigned yet — set an owner on tasks and cases to see capacity here.</div>}
        {load.map((l) => (
          <div key={l.person} style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 0", borderTop: `1px solid ${C.line}`, flexWrap: "wrap" }}>
            <span style={{ fontFamily: C.serif, fontWeight: 700, fontSize: 14, minWidth: 110 }}>{l.person}</span>
            <div style={{ flex: "1 1 160px", height: 8, background: C.greenSoft, borderRadius: 4, overflow: "hidden", minWidth: 120 }}>
              <div style={{ width: `${Math.min(100, l.open * 12)}%`, height: "100%", background: l.late ? C.pink : C.green }} />
            </div>
            <span style={{ fontFamily: C.mono, fontSize: 10.5, color: C.inkSoft }}>{l.open} open · {l.cases} case{l.cases === 1 ? "" : "s"}</span>
            {l.late > 0 && <Pill tone="red">{l.late} overdue</Pill>}
          </div>
        ))}
      </Card>
    </div>
  );
}
