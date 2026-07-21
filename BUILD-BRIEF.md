# The Wire — Build Brief, Phase 1

**For:** Marwa, working in Claude Code
**Status:** Draft, pending Jeremy's scope markup
**Date:** 21 July 2026

---

## How to use this document

Put this file in the repo root as `BUILD-BRIEF.md` and point Claude Code at it. Work through it section by section — don't paste the whole thing as one prompt and expect a finished system. The suggested working order is at the end.

Two documents govern this build and beat anything here if they conflict: **The Living Document** spec (the four-section structure) and **Jeremy's frozen scope** once it exists. This brief covers Phase 1 only.

---

## What The Wire is

The client intelligence spine for TCFP. One place holding what we know about each client — the human things and the financial things — so that anyone preparing for a meeting walks in with the full picture instead of hunting across Asana, moneyinfo, Papercloud, Voyant and folders.

It is not a CRM we bought. It's TCFP-shaped and minimal.

**The Living Document is the spine.** Every client record is four sections, always in this order:

1. **Soft facts** — the human intelligence. Dated entries, newest first. Adviser-written.
2. **Points to note / discuss** — the running agenda. Numbered. Items carry forward with a resolution note; nothing disappears without being closed.
3. **Meeting Note** — the only section the client ever sees. Calm, plain English.
4. **Portfolio detail** — the technical layer, plus a completion log of what's happened since the adviser last looked.

Human first, technical last. That ordering is deliberate and not up for redesign.

---

## Phase 1 scope

Build the spine as a real hosted application: a database, an API, a web front end, team logins, and the moneyinfo staging sync feeding data in.

### In scope

- Postgres database with the schema below
- REST API over it
- React front end (use `the-wire.jsx` prototype as the reference for structure and behaviour — it's a working spec, not a design mockup to copy pixel-for-pixel)
- Email/password login for the team, with roles
- Audit log on every write
- moneyinfo **staging** sync as the data-in path
- Deployed to a hosting environment the team can reach from anywhere
- Automated daily backups, tested restore

### Explicitly out of scope for Phase 1

Do not build these yet. They depend on decisions that haven't been made, or on Phase 1 existing first:

- **Any AI features** — transcript extraction, note drafting, AI search, daily briefings, auto-allocation of tasks. These come in Phase 2 with human sense-check gates designed in from the start.
- **Writing back to moneyinfo.** The API supports it (`isInternal` on thread messages), but posting Meeting Notes back is a separate decision.
- **Asana replacement.** Task management exists in Phase 1 as a data structure and a UI, but migrating the firm off Asana is a business decision, not a build task.
- **Fathom, Voyant, Papercloud integrations.**
- **Client-facing anything.** No client logins, no portal. The Wire is internal.
- **Live client data.** See the hard rule below.

### Hard rule: no live client data in Phase 1

Build and test against moneyinfo **staging** only. The sync script redacts surnames to `TESTCLIENT` and this stays on.

Live data goes in only when Jeremy has ruled on the data-protection question — TCFP becoming controller of a hosted system holding ~250 families' financial and personal detail. That ruling determines hosting region, encryption requirements, retention, and possibly the DPIA. Building the app doesn't wait on it; **putting real people in it does.**

---

## Architecture

Boring and standard. This system needs to be maintainable by someone who isn't the person who built it.

- **Database:** Postgres 16
- **API:** Node 20 + TypeScript, Express or Fastify
- **Front end:** React + Vite, TypeScript
- **Auth:** session cookies (httpOnly, secure, sameSite=lax) backed by a sessions table. Passwords hashed with argon2 or bcrypt. Do not roll custom crypto; do not put JWTs in localStorage.
- **Hosting:** a UK or EU region. Managed Postgres with automated backups. Single small app instance is fine — this is ~10 users.
- **Secrets:** environment variables, never committed. `.env` in `.gitignore` from the first commit.
- **Repo:** private. Access limited to whoever is working on it.

### Non-negotiables

- **TLS everywhere.** No plain HTTP, ever.
- **Every write audited** — who, what, when, old value, new value.
- **Soft deletes.** Nothing is hard-deleted from client records. `deleted_at` timestamps.
- **Optimistic concurrency.** Two people editing one client must not silently lose an edit — this is the flaw in the prototype and it must not survive into the real thing. Version column on clients; reject stale writes with a clear message.

---

## Data model

Starting schema. Refine as you build, but keep the four sections distinct — don't collapse them into one generic "notes" table.

```sql
-- People who use The Wire
users (
  id, email unique, password_hash, name,
  role,                        -- 'adviser' | 'client_manager' | 'admin'
  active bool, created_at, last_login_at
)

sessions (id, user_id, expires_at, created_at)

-- The client families
clients (
  id,
  moneyinfo_client_id,         -- nullable; links to the sync
  first_names, surname,
  dob, dob_2,                  -- couples are one record
  email, phone,
  status,                      -- 'Working' | 'Retired'
  adviser_id  -> users.id,
  cm_id       -> users.id,     -- client manager
  review_cycle,                -- 'Annual' | 'Interim' | 'Ad hoc'
  next_review_date, next_review_type,
  last_review_date,
  version int,                 -- optimistic concurrency
  created_at, updated_at, deleted_at
)

-- Section 1
soft_facts (
  id, client_id, fact_date, text,
  author_id -> users.id,
  created_at, deleted_at
)

-- Section 2 — carry-forward behaviour matters, see below
points (
  id, client_id, number int, text,
  status,                      -- 'open' | 'carried' | 'resolved'
  resolution_note,             -- required when leaving 'open'
  raised_at, raised_context,   -- e.g. 'Interim, Feb 2026'
  resolved_at, resolved_by -> users.id,
  created_at, deleted_at
)

-- Section 3 — client-visible
meeting_notes (
  id, client_id, meeting_date,
  meeting_type,                -- 'Annual' | 'Interim' | 'Ad hoc'
  body text,
  author_id -> users.id,
  status,                      -- 'draft' | 'approved'
  approved_by -> users.id, approved_at,
  created_at, deleted_at
)

-- Section 4
portfolio_summary (client_id pk, summary text, updated_by, updated_at)
portfolio_log (id, client_id, entry_date, text, author_id, created_at, deleted_at)

-- Tasks — the sense-check gate is the point
tasks (
  id, client_id,
  text, owner_id -> users.id, due_date,
  status,                      -- 'awaiting_sense_check' | 'confirmed' | 'done'
  source,                      -- 'manual' | 'meeting_note' | 'sync'
  confirmed_by -> users.id, confirmed_at,
  created_at, deleted_at
)

-- Case pipeline
cases (
  id, client_id, title,
  stage,                       -- Fact Find | Research | Recommendation |
                               -- Suitability Report | Compliance Review |
                               -- Client Approval | Submission |
                               -- Provider Processing | Completed
  waiting_on,                  -- 'us' | 'client' | 'provider' | 'third_party'
  owner_id -> users.id,
  opened_at, stage_updated_at, closed_at,
  created_at, deleted_at
)

case_events (id, case_id, from_stage, to_stage, note, user_id, created_at)

-- Everything
audit_log (
  id, user_id, entity_type, entity_id, action,
  before jsonb, after jsonb, created_at
)
```

### Behaviour the schema implies

**Points carry forward properly.** A point can't move out of `open` without a resolution note. When resolved it stays visible in history — it doesn't vanish. When carried, it appears in the next meeting's prep with its full history and the note explaining why it carried. This is the mechanism that stops things being quietly forgotten, so get it right.

**Tasks land as `awaiting_sense_check`.** Anything created automatically — from a saved Meeting Note, from a sync — arrives needing a human to confirm it before it counts as real work. A person confirms; the system never self-confirms. Build this gate now even though the AI that will feed it comes later.

**Meeting Notes have a draft/approved distinction.** Only approved notes are treated as client-visible. Nothing reaches a client without a person approving it.

---

## API

Conventional REST. Every endpoint requires a session. Return 401 unauthenticated, 403 unauthorised, 409 on stale version.

```
POST   /api/auth/login | logout        GET /api/auth/me

GET    /api/clients                    ?q= &decade= &status= &adviser= &review_due=
POST   /api/clients
GET    /api/clients/:id                -- full spine, all four sections
PATCH  /api/clients/:id                -- requires version, 409 if stale

POST   /api/clients/:id/soft-facts     DELETE /api/soft-facts/:id
POST   /api/clients/:id/points         PATCH  /api/points/:id     -- resolve/carry
POST   /api/clients/:id/meeting-notes  PATCH  /api/meeting-notes/:id
PUT    /api/clients/:id/portfolio      POST   /api/clients/:id/portfolio-log

GET    /api/tasks                      ?owner= &status= &due=today|overdue
POST   /api/clients/:id/tasks          PATCH /api/tasks/:id

GET    /api/cases                      ?stage= &waiting_on= &owner=
POST   /api/clients/:id/cases          PATCH /api/cases/:id

GET    /api/search                     ?q=   -- across soft facts, points, notes, portfolio
GET    /api/clients/:id/prep           -- assembled prep pack
GET    /api/ops/dashboard              -- reviews due, pipeline counts, workload
```

**Search matters more than it looks.** "Which clients play golf", "who has grandchildren", "everything we've discussed about IHT with this client" — this is on both wishlists. Postgres full-text search across `soft_facts.text`, `points.text`, `meeting_notes.body` and `portfolio_summary.summary` is enough for Phase 1. Index properly; don't do `LIKE '%...%'` across the table.

**The prep endpoint is the daily-use feature.** For one client it returns: open and carried points with history, recent soft facts, portfolio summary and recent log entries, outstanding tasks, and the last Meeting Note. Assembled server-side in one call.

---

## Front end

The prototype (`the-wire.jsx`) shows the intended structure, brand and behaviour. Reference it for: the four-section spine layout with the numbered rail, the search-and-filter pattern, the prep view, the tasks sense-check gate, and the operations dashboard.

Brand: primary purple `#342562`; secondary `#F26DF9`, `#EB4B98`, `#B97CAF`, `#FFF275`. Yellow means "a human is needed here" — sense-check states, imminent reviews. Confirm the actual brand typeface with Martine before settling on one; the prototype uses Plus Jakarta Sans as a stand-in.

Screens: Login · Clients (searchable list) · Client (the spine, four sections) · Prep view · Tasks (firm-wide, filterable by owner, due today, overdue) · Operations (reviews due, case pipeline, workload) · Cross-client search.

---

## moneyinfo sync

`moneyinfo-sync.mjs` exists as a standalone script and works as the starting point. For Phase 1, adapt it into a server-side job writing to Postgres rather than a JSON file.

Prerequisites, all needed before the first call: IPs whitelisted with moneyinfo, credentials from SendSafely in environment variables, and confirmation from them of the auth scheme (bearer token vs API key header).

Read-only. It fills basic facts and Portfolio detail. It does **not** write soft facts, points or meeting notes — those are the adviser's narrative and machine-generated content must not appear in them. Thread messages get stored raw for the Phase 2 extraction step; they do not go into the spine.

Fetch the spec first — `node moneyinfo-sync.mjs --spec` — and correct the field mappings against the real schemas. The mappings in the script are best-guess from the endpoint list and will need fixing on first contact. That's expected.

---

## Suggested working order

Each step should end with something that runs.

1. Repo, TypeScript, Postgres in Docker, migrations, `.env` handling, `.gitignore`. Commit.
2. Schema + migrations. Seed script with the three TESTCLIENT families from the prototype.
3. Auth: users, sessions, login/logout/me, password hashing. Roles present but permissive for now.
4. Client CRUD + the four section endpoints, with optimistic concurrency and audit logging on every write.
5. Front end shell: login, client list, client spine view. Reference the prototype.
6. Points carry-forward logic, end to end. Test it properly — this is the load-bearing behaviour.
7. Tasks with the sense-check gate; cases with stage transitions and events.
8. Search endpoint + cross-client search UI.
9. Prep endpoint + prep view.
10. Operations dashboard.
11. moneyinfo staging sync as a server-side job.
12. Deploy. Backups configured and a restore actually tested — not assumed.

## Definition of done for Phase 1

- The team can log in from anywhere and see the same data
- Two people editing one client don't lose each other's work
- Every change is attributable to a person and a time
- A point raised in one meeting reliably surfaces in the next meeting's prep
- Nothing automated reaches a client, or counts as a task, without a human confirming it
- Someone can search "golf" and get a list of clients
- Staging data flows in from moneyinfo without manual copying
- The database is backed up daily and a restore has been performed successfully at least once

## Open questions — for Jeremy, not for Marwa to decide

1. **Data protection.** Hosted system, ~250 families, financial and personal detail. Controller responsibilities, hosting region, DPIA, retention policy. **Blocks live data.**
2. **Hosting provider and who owns the account** — TCFP's, not an individual's.
3. **Does The Wire replace Asana**, or run alongside it?
4. **Who can see what.** Can every adviser read every client's soft facts, or is it restricted by relationship? The roles column exists; the policy doesn't.
5. **Meeting Notes back into moneyinfo** — yes or no, and who approves.

---

*Phase 1 builds the spine. Phase 2 — the AI layers, the integrations, the write-backs — comes after this exists and after the frozen scope and the data-protection ruling. Nothing in Phase 2 should be started early, even if it looks easy.*
