/*
 * Seeds the three TESTCLIENT families from the-wire.jsx prototype.
 * Dev-only: truncates the domain tables first so this can be re-run safely
 * against a local Docker Postgres. Never point this at anything but a local
 * or staging database — surnames stay TESTCLIENT per the brief's hard rule.
 */
import { pool } from "./db.js";
import { hashPassword } from "./auth/password.js";

// Dev-only credential shared by all seeded staff accounts, for logging into
// a local instance. On a real deployed instance (NODE_ENV=production) this
// refuses to run without SEED_PASSWORD set - a well-known password shipped
// in source control is fine for localhost, not for anything reachable from
// the internet, even with fake TESTCLIENT data behind it. Per-person real
// passwords are a later Phase 1 follow-up, same as before.
const DEV_PASSWORD = "changeme123";

if (process.env.NODE_ENV === "production" && !process.env.SEED_PASSWORD) {
  console.error(
    "Refusing to seed a production instance with the default password.\n" +
      "Set SEED_PASSWORD in the environment first, then re-run this script."
  );
  process.exit(1);
}
const STAFF_PASSWORD = process.env.SEED_PASSWORD || DEV_PASSWORD;

type StaffName = "Jeremy" | "Zoe" | "Louise" | "Sarah";

const STAFF: { name: StaffName; email: string; role: "adviser" | "client_manager" }[] = [
  { name: "Jeremy", email: "jeremy@tcfp.test", role: "adviser" },
  { name: "Zoe", email: "zoe@tcfp.test", role: "adviser" },
  { name: "Louise", email: "louise@tcfp.test", role: "client_manager" },
  { name: "Sarah", email: "sarah@tcfp.test", role: "client_manager" },
];

const WAITING_ON: Record<string, string> = {
  Us: "us",
  Client: "client",
  Provider: "provider",
  "Third party": "third_party",
};

const TASK_STATUS: Record<string, string> = {
  confirmed: "confirmed",
  sense: "awaiting_sense_check",
};

interface SeedClient {
  firstNames: string;
  dob: string;
  dob2: string | null;
  email: string;
  phone: string;
  status: "Working" | "Retired";
  adviser: StaffName;
  cm: StaffName;
  nextMeeting: { date: string; type: string };
  reviewCycle: string;
  lastReview: string;
  cases: { title: string; stage: string; waiting: string; updated: string; owner: StaffName }[];
  softFacts: { date: string; text: string }[];
  points: { num: number; text: string; status: string; resolution: string; from: string }[];
  meetingNotes: { date: string; type: string; text: string }[];
  portfolio: { summary: string; logs: { date: string; text: string }[] };
  tasks: { text: string; owner: StaffName; due: string; status: string }[];
  // Hand-written sample holdings, standing in for real moneyinfo sync
  // output (that's the last build step, not done yet) so the asset-
  // allocation chart on the client page has something real to render.
  // assetClass deliberately includes one non-canonical value (Margaret's
  // "Alternatives") to exercise the chart's "Other" fallback bucket, not
  // just the four named categories.
  holdings: {
    source: "plan" | "investment" | "account";
    provider: string;
    planType: string;
    holdingName: string;
    assetClass: string;
    value: number;
  }[];
}

const CLIENTS: SeedClient[] = [
  {
    firstNames: "Chris & Helen",
    dob: "1962-04-11",
    dob2: "1964-09-02",
    email: "chris.testclient@example.com",
    phone: "07700 900001",
    status: "Retired",
    adviser: "Jeremy",
    cm: "Louise",
    nextMeeting: { date: "2026-08-04", type: "Annual" },
    reviewCycle: "Annual",
    lastReview: "2026-02-10",
    cases: [
      {
        title: "Care fee direct debit - confirm provider position",
        stage: "Provider Processing",
        waiting: "Provider",
        updated: "2026-06-30",
        owner: "Louise",
      },
    ],
    softFacts: [
      { date: "2026-06-12", text: "Granddaughter Layla born - sister to Isla. Whole family down in Cornwall for two weeks in August." },
      { date: "2026-05-02", text: "Right shoulder may have gone again - rotator cuff last time. Op possible in autumn." },
      { date: "2025-11-20", text: "Ferrari put away for winter. Talking about one last continental trip in it next summer." },
    ],
    points: [
      { num: 1, text: "His dad's care fees may need a DD around March time - still looking likely?", status: "carried", resolution: "Carry forward - forgot to ask at Interim.", from: "Interim, Feb 2026" },
      { num: 2, text: "Chris using up 20% band with Fidelity income - check if expecting any income from company?", status: "open", resolution: "", from: "Annual, Aug 2025" },
      { num: 3, text: "Helen's ISA allowance - £14,200 unused this tax year.", status: "open", resolution: "", from: "Prep, Jul 2026" },
    ],
    meetingNotes: [
      {
        date: "2026-02-10",
        type: "Interim",
        text: "Overall position\nA quiet six months, and a good one. Nothing needed changing, which is itself a sign the plan is working.\n\nCash flow & spending\nSpending remains comfortably within the plan. The Cornwall house purchase fund stays where it is until the family decides.\n\nNext steps & actions\nTCFP: confirm the position on the care fee direct debit before the Annual.\nClient: let us know once the Cornwall conversation has moved on.",
      },
    ],
    portfolio: {
      summary: "Fidelity GIA + ISAs, RJIS discretionary. Cash buffer 18 months' spending. Regular withdrawal £3,500/m from JB GIA. CGT realised YTD £4,100 of £3,000 allowance - watch. Voyant refreshed May 2026.",
      logs: [
        { date: "2026-06-28", text: "£20k withdrawal sent from JB GIA (house fund top-up)." },
        { date: "2026-04-14", text: "ISA subscriptions completed for both, 2026/27." },
      ],
    },
    tasks: [
      { text: "Confirm care fee DD position with provider before Annual", owner: "Louise", due: "2026-07-28", status: "confirmed" },
      { text: "Draft info request message to client for Annual", owner: "Louise", due: "2026-07-21", status: "sense" },
    ],
    holdings: [
      { source: "account", provider: "Fidelity", planType: "GIA", holdingName: "General Investment Account (Chris)", assetClass: "Equity", value: 138500 },
      { source: "plan", provider: "Fidelity", planType: "ISA", holdingName: "Stocks & Shares ISA (Chris)", assetClass: "Equity", value: 74200 },
      { source: "plan", provider: "Fidelity", planType: "ISA", holdingName: "Stocks & Shares ISA (Helen)", assetClass: "Equity", value: 71800 },
      { source: "investment", provider: "RJIS", planType: "Discretionary Managed", holdingName: "Discretionary Portfolio", assetClass: "Fixed Income", value: 96000 },
      { source: "account", provider: "JB Wealth", planType: "GIA", holdingName: "General Investment Account (regular withdrawal)", assetClass: "Fixed Income", value: 112300 },
      { source: "account", provider: "Barclays", planType: "Cash Savings", holdingName: "Cash Reserve (18 months)", assetClass: "Cash", value: 63000 },
    ],
  },
  {
    firstNames: "Aaron",
    dob: "1981-01-27",
    dob2: null,
    email: "aaron.testclient@example.com",
    phone: "07700 900002",
    status: "Working",
    adviser: "Zoe",
    cm: "Sarah",
    nextMeeting: { date: "2026-09-15", type: "Interim" },
    reviewCycle: "Annual",
    lastReview: "2025-11-18",
    cases: [
      {
        title: "Protection review - comparison once salary confirmed",
        stage: "Research",
        waiting: "Client",
        updated: "2026-06-20",
        owner: "Sarah",
      },
    ],
    softFacts: [
      { date: "2026-05-30", text: "Got the MD role at Marsh - starts September. Big step up, some nerves under the excitement." },
      { date: "2026-03-15", text: "Training for a half marathon with his brother. Knee holding up so far." },
    ],
    points: [
      { num: 1, text: "New MD package - share scheme details needed before we can advise on pension headroom.", status: "open", resolution: "", from: "Call, Jun 2026" },
      { num: 2, text: "Protection review promised last Annual - still outstanding.", status: "carried", resolution: "Carry forward - waiting on new salary confirmation.", from: "Annual, Nov 2025" },
    ],
    meetingNotes: [
      {
        date: "2025-11-18",
        type: "Annual",
        text: "Overall position\nA strong year. The promotion conversation was already in the air, and the plan is built to absorb good news as well as bad.\n\nPension contributions\nHolding at current levels until the new package is confirmed, then we revisit headroom.\n\nNext steps & actions\nClient: send through the share scheme booklet when it arrives.\nTCFP: prepare a protection comparison once salary is confirmed.",
      },
    ],
    portfolio: {
      summary: "Workplace pension + SIPP, S&S ISA maxed 25/26. No GIA. Annual allowance headroom depends on new package - flagged in Points.",
      logs: [{ date: "2026-04-08", text: "ISA subscription 2026/27 completed." }],
    },
    tasks: [{ text: "Chase share scheme booklet", owner: "Sarah", due: "2026-08-01", status: "confirmed" }],
    holdings: [
      { source: "plan", provider: "Scottish Widows", planType: "Workplace Pension", holdingName: "Workplace Pension", assetClass: "Equity", value: 68400 },
      { source: "plan", provider: "AJ Bell", planType: "SIPP", holdingName: "Self-Invested Personal Pension", assetClass: "Equity", value: 41200 },
      { source: "investment", provider: "AJ Bell", planType: "SIPP", holdingName: "Fixed Income Sleeve", assetClass: "Fixed Income", value: 12800 },
      { source: "plan", provider: "Vanguard", planType: "ISA", holdingName: "Stocks & Shares ISA (maxed 2025/26)", assetClass: "Equity", value: 28600 },
      { source: "account", provider: "Monzo", planType: "Cash Savings", holdingName: "Emergency Fund", assetClass: "Cash", value: 9500 },
    ],
  },
  {
    firstNames: "Margaret",
    dob: "1949-08-19",
    dob2: null,
    email: "margaret.testclient@example.com",
    phone: "07700 900003",
    status: "Retired",
    adviser: "Jeremy",
    cm: "Louise",
    nextMeeting: { date: "2026-07-29", type: "Interim" },
    reviewCycle: "Annual",
    lastReview: "2026-01-22",
    cases: [
      {
        title: "Gifting options - JISA vs direct",
        stage: "Recommendation",
        waiting: "Us",
        updated: "2026-07-15",
        owner: "Jeremy",
      },
    ],
    softFacts: [
      { date: "2026-07-01", text: "Sister's health worsening - Margaret is now driving to Norwich most weekends. Sounded tired on the phone." },
      { date: "2026-02-11", text: "Joined the village choir. First concert in June - 'terrifying and wonderful'." },
    ],
    points: [
      { num: 1, text: "Gifting to grandchildren - wants to 'do something meaningful while I can see them enjoy it'. Explore JISA vs direct gifts.", status: "open", resolution: "", from: "Annual, Jan 2026" },
      { num: 2, text: "Will last reviewed 2019. LPA in place. Nudge gently - sister situation may make this timely.", status: "open", resolution: "", from: "Prep, Jul 2026" },
    ],
    meetingNotes: [
      {
        date: "2026-01-22",
        type: "Annual",
        text: "Overall position\nEverything remains in good order, and Margaret should feel free to say yes to the things she's been hesitating over - the plan has room in it.\n\nFamily gifting\nWe discussed gifting to the grandchildren and agreed to bring worked options to the next meeting rather than rush a decision.\n\nNext steps & actions\nTCFP: prepare gifting options.\nClient: nothing needed - just enjoy the choir.",
      },
    ],
    portfolio: {
      summary: "RJIS discretionary + cash. Income comfortably covered by pensions; portfolio is legacy-oriented. IHT position reviewed Jan 2026 - within NRB + RNRB with current gifting plan.",
      logs: [],
    },
    tasks: [
      { text: "Prepare gifting options (JISA vs direct) for Interim", owner: "Jeremy", due: "2026-07-27", status: "confirmed" },
      { text: "Add sister situation to vulnerability watch-list - sense check with adviser", owner: "Louise", due: "2026-07-22", status: "sense" },
    ],
    holdings: [
      { source: "investment", provider: "RJIS", planType: "Discretionary Managed", holdingName: "Discretionary Portfolio", assetClass: "Equity", value: 210000 },
      { source: "investment", provider: "RJIS", planType: "Discretionary Managed", holdingName: "Fixed Income Sleeve", assetClass: "Fixed Income", value: 95000 },
      { source: "investment", provider: "TIME Investments", planType: "Property Fund", holdingName: "Legacy Property Fund", assetClass: "Property", value: 48000 },
      { source: "account", provider: "NS&I", planType: "Cash Savings", holdingName: "Premium Bonds & Cash", assetClass: "Cash", value: 34500 },
      { source: "investment", provider: "Octopus", planType: "EIS", holdingName: "IHT-Qualifying EIS Portfolio", assetClass: "Alternatives", value: 22000 },
    ],
  },
];

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Dev-only reset so this script can be re-run after schema changes.
    await client.query(`
      TRUNCATE
        audit_log, case_events, cases, tasks, portfolio_holdings, portfolio_log,
        portfolio_summary, meeting_notes, points, soft_facts, clients, sessions, users
      RESTART IDENTITY CASCADE
    `);

    const staffPasswordHash = await hashPassword(STAFF_PASSWORD);

    const staffId = new Map<StaffName, number>();
    for (const staff of STAFF) {
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO users (email, password_hash, name, role, active)
         VALUES ($1, $2, $3, $4, true)
         RETURNING id`,
        [staff.email, staffPasswordHash, staff.name, staff.role]
      );
      staffId.set(staff.name, rows[0].id);
    }

    for (const c of CLIENTS) {
      const adviserId = staffId.get(c.adviser)!;
      const cmId = staffId.get(c.cm)!;

      const { rows: clientRows } = await client.query<{ id: number }>(
        `INSERT INTO clients (
           first_names, surname, dob, dob_2, email, phone, status,
           adviser_id, cm_id, review_cycle, next_review_date, next_review_type,
           last_review_date, next_point_number
         ) VALUES ($1, 'TESTCLIENT', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING id`,
        [
          c.firstNames,
          c.dob,
          c.dob2,
          c.email,
          c.phone,
          c.status,
          adviserId,
          cmId,
          c.reviewCycle,
          c.nextMeeting.date,
          c.nextMeeting.type,
          c.lastReview,
          c.points.length + 1,
        ]
      );
      const clientId = clientRows[0].id;

      for (const fact of c.softFacts) {
        await client.query(
          `INSERT INTO soft_facts (client_id, fact_date, text, author_id)
           VALUES ($1, $2, $3, $4)`,
          [clientId, fact.date, fact.text, adviserId]
        );
      }

      for (const point of c.points) {
        await client.query(
          `INSERT INTO points (client_id, number, text, status, resolution_note, raised_context)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [clientId, point.num, point.text, point.status, point.resolution || null, point.from]
        );
      }

      for (const note of c.meetingNotes) {
        await client.query(
          `INSERT INTO meeting_notes (
             client_id, meeting_date, meeting_type, body, author_id,
             status, approved_by, approved_at
           ) VALUES ($1, $2, $3, $4, $5, 'approved', $5, now())`,
          [clientId, note.date, note.type, note.text, adviserId]
        );
      }

      await client.query(
        `INSERT INTO portfolio_summary (client_id, summary, updated_by)
         VALUES ($1, $2, $3)`,
        [clientId, c.portfolio.summary, adviserId]
      );

      for (const log of c.portfolio.logs) {
        await client.query(
          `INSERT INTO portfolio_log (client_id, entry_date, text, author_id)
           VALUES ($1, $2, $3, $4)`,
          [clientId, log.date, log.text, cmId]
        );
      }

      // moneyinfo_holding_id stays NULL and raw marks these as hand-seeded -
      // they never came from a real sync, so there's nothing to link back to.
      for (const h of c.holdings) {
        await client.query(
          `INSERT INTO portfolio_holdings
             (client_id, moneyinfo_holding_id, source, provider, plan_type, holding_name, asset_class, value, currency, as_of_date, raw)
           VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, 'GBP', $8, $9)`,
          [clientId, h.source, h.provider, h.planType, h.holdingName, h.assetClass, h.value, c.lastReview, JSON.stringify({ seed: true })]
        );
      }

      for (const task of c.tasks) {
        const ownerId = staffId.get(task.owner)!;
        const status = TASK_STATUS[task.status] ?? task.status;
        const confirmed = status === "confirmed";
        await client.query(
          `INSERT INTO tasks (
             client_id, text, owner_id, due_date, status, source,
             confirmed_by, confirmed_at
           ) VALUES ($1, $2, $3, $4, $5, 'manual', $6, $7)`,
          [
            clientId,
            task.text,
            ownerId,
            task.due,
            status,
            confirmed ? ownerId : null,
            confirmed ? new Date() : null,
          ]
        );
      }

      for (const kase of c.cases) {
        const ownerId = staffId.get(kase.owner)!;
        await client.query(
          `INSERT INTO cases (
             client_id, title, stage, waiting_on, owner_id, opened_at, stage_updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $6)`,
          [clientId, kase.title, kase.stage, WAITING_ON[kase.waiting], ownerId, kase.updated]
        );
      }
    }

    await client.query("COMMIT");
    console.log(`Seeded ${STAFF.length} staff users and ${CLIENTS.length} TESTCLIENT families.`);
    // Never echo the real password into logs on a deployed instance -
    // only the local dev default is safe to print, since it's already
    // public (it's committed in this file).
    const loginHint = process.env.SEED_PASSWORD
      ? "password is whatever SEED_PASSWORD was set to for this run"
      : `password "${DEV_PASSWORD}"`;
    console.log(`Login: any of ${STAFF.map((s) => s.email).join(", ")} / ${loginHint}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
