/*
 * Seeds the three TESTCLIENT families from the-wire.jsx prototype.
 * Dev-only: truncates the domain tables first so this can be re-run safely
 * against a local Docker Postgres. Never point this at anything but a local
 * or staging database — surnames stay TESTCLIENT per the brief's hard rule.
 */
import { pool } from "./db.js";
import { hashPassword } from "./auth/password.js";

// Dev-only credential shared by all seeded staff accounts, for logging into
// a local instance. Never used against staging or live — those get real
// per-person passwords set some other way once auth grows beyond Phase 1.
const DEV_PASSWORD = "changeme123";

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
        title: "Care fee direct debit — confirm provider position",
        stage: "Provider Processing",
        waiting: "Provider",
        updated: "2026-06-30",
        owner: "Louise",
      },
    ],
    softFacts: [
      { date: "2026-06-12", text: "Granddaughter Layla born — sister to Isla. Whole family down in Cornwall for two weeks in August." },
      { date: "2026-05-02", text: "Right shoulder may have gone again — rotator cuff last time. Op possible in autumn." },
      { date: "2025-11-20", text: "Ferrari put away for winter. Talking about one last continental trip in it next summer." },
    ],
    points: [
      { num: 1, text: "His dad's care fees may need a DD around March time — still looking likely?", status: "carried", resolution: "Carry forward — forgot to ask at Interim.", from: "Interim, Feb 2026" },
      { num: 2, text: "Chris using up 20% band with Fidelity income — check if expecting any income from company?", status: "open", resolution: "", from: "Annual, Aug 2025" },
      { num: 3, text: "Helen's ISA allowance — £14,200 unused this tax year.", status: "open", resolution: "", from: "Prep, Jul 2026" },
    ],
    meetingNotes: [
      {
        date: "2026-02-10",
        type: "Interim",
        text: "Overall position\nA quiet six months, and a good one. Nothing needed changing, which is itself a sign the plan is working.\n\nCash flow & spending\nSpending remains comfortably within the plan. The Cornwall house purchase fund stays where it is until the family decides.\n\nNext steps & actions\nTCFP: confirm the position on the care fee direct debit before the Annual.\nClient: let us know once the Cornwall conversation has moved on.",
      },
    ],
    portfolio: {
      summary: "Fidelity GIA + ISAs, RJIS discretionary. Cash buffer 18 months' spending. Regular withdrawal £3,500/m from JB GIA. CGT realised YTD £4,100 of £3,000 allowance — watch. Voyant refreshed May 2026.",
      logs: [
        { date: "2026-06-28", text: "£20k withdrawal sent from JB GIA (house fund top-up)." },
        { date: "2026-04-14", text: "ISA subscriptions completed for both, 2026/27." },
      ],
    },
    tasks: [
      { text: "Confirm care fee DD position with provider before Annual", owner: "Louise", due: "2026-07-28", status: "confirmed" },
      { text: "Draft info request message to client for Annual", owner: "Louise", due: "2026-07-21", status: "sense" },
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
        title: "Protection review — comparison once salary confirmed",
        stage: "Research",
        waiting: "Client",
        updated: "2026-06-20",
        owner: "Sarah",
      },
    ],
    softFacts: [
      { date: "2026-05-30", text: "Got the MD role at Marsh — starts September. Big step up, some nerves under the excitement." },
      { date: "2026-03-15", text: "Training for a half marathon with his brother. Knee holding up so far." },
    ],
    points: [
      { num: 1, text: "New MD package — share scheme details needed before we can advise on pension headroom.", status: "open", resolution: "", from: "Call, Jun 2026" },
      { num: 2, text: "Protection review promised last Annual — still outstanding.", status: "carried", resolution: "Carry forward — waiting on new salary confirmation.", from: "Annual, Nov 2025" },
    ],
    meetingNotes: [
      {
        date: "2025-11-18",
        type: "Annual",
        text: "Overall position\nA strong year. The promotion conversation was already in the air, and the plan is built to absorb good news as well as bad.\n\nPension contributions\nHolding at current levels until the new package is confirmed, then we revisit headroom.\n\nNext steps & actions\nClient: send through the share scheme booklet when it arrives.\nTCFP: prepare a protection comparison once salary is confirmed.",
      },
    ],
    portfolio: {
      summary: "Workplace pension + SIPP, S&S ISA maxed 25/26. No GIA. Annual allowance headroom depends on new package — flagged in Points.",
      logs: [{ date: "2026-04-08", text: "ISA subscription 2026/27 completed." }],
    },
    tasks: [{ text: "Chase share scheme booklet", owner: "Sarah", due: "2026-08-01", status: "confirmed" }],
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
        title: "Gifting options — JISA vs direct",
        stage: "Recommendation",
        waiting: "Us",
        updated: "2026-07-15",
        owner: "Jeremy",
      },
    ],
    softFacts: [
      { date: "2026-07-01", text: "Sister's health worsening — Margaret is now driving to Norwich most weekends. Sounded tired on the phone." },
      { date: "2026-02-11", text: "Joined the village choir. First concert in June — 'terrifying and wonderful'." },
    ],
    points: [
      { num: 1, text: "Gifting to grandchildren — wants to 'do something meaningful while I can see them enjoy it'. Explore JISA vs direct gifts.", status: "open", resolution: "", from: "Annual, Jan 2026" },
      { num: 2, text: "Will last reviewed 2019. LPA in place. Nudge gently — sister situation may make this timely.", status: "open", resolution: "", from: "Prep, Jul 2026" },
    ],
    meetingNotes: [
      {
        date: "2026-01-22",
        type: "Annual",
        text: "Overall position\nEverything remains in good order, and Margaret should feel free to say yes to the things she's been hesitating over — the plan has room in it.\n\nFamily gifting\nWe discussed gifting to the grandchildren and agreed to bring worked options to the next meeting rather than rush a decision.\n\nNext steps & actions\nTCFP: prepare gifting options.\nClient: nothing needed — just enjoy the choir.",
      },
    ],
    portfolio: {
      summary: "RJIS discretionary + cash. Income comfortably covered by pensions; portfolio is legacy-oriented. IHT position reviewed Jan 2026 — within NRB + RNRB with current gifting plan.",
      logs: [],
    },
    tasks: [
      { text: "Prepare gifting options (JISA vs direct) for Interim", owner: "Jeremy", due: "2026-07-27", status: "confirmed" },
      { text: "Add sister situation to vulnerability watch-list — sense check with adviser", owner: "Louise", due: "2026-07-22", status: "sense" },
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
        audit_log, case_events, cases, tasks, portfolio_log, portfolio_summary,
        meeting_notes, points, soft_facts, clients, sessions, users
      RESTART IDENTITY CASCADE
    `);

    const devPasswordHash = await hashPassword(DEV_PASSWORD);

    const staffId = new Map<StaffName, number>();
    for (const staff of STAFF) {
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO users (email, password_hash, name, role, active)
         VALUES ($1, $2, $3, $4, true)
         RETURNING id`,
        [staff.email, devPasswordHash, staff.name, staff.role]
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
    console.log(`Dev login: any of ${STAFF.map((s) => s.email).join(", ")} / password "${DEV_PASSWORD}"`);
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
