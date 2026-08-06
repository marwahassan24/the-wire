// Mirrors the API's response shapes directly (snake_case, matching the DB
// columns — the API doesn't translate casing, so neither does this layer).

export interface ClientSummary {
  id: number;
  moneyinfo_client_id: string | null;
  first_names: string;
  surname: string;
  dob: string | null;
  dob_2: string | null;
  email: string | null;
  phone: string | null;
  status: "Working" | "Retired";
  adviser_id: number;
  cm_id: number;
  review_cycle: "Annual" | "Interim" | "Ad hoc";
  next_review_date: string | null;
  next_review_type: "Annual" | "Interim" | "Ad hoc" | null;
  last_review_date: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface SoftFact {
  id: number;
  client_id: number;
  fact_date: string;
  text: string;
  author_id: number;
  created_at: string;
}

export interface Point {
  id: number;
  client_id: number;
  number: number;
  text: string;
  status: "open" | "carried" | "resolved";
  resolution_note: string | null;
  raised_at: string;
  raised_context: string | null;
  resolved_at: string | null;
  resolved_by: number | null;
  created_at: string;
}

export interface MeetingNoteTask {
  id: number;
  text: string;
  status: "awaiting_sense_check" | "confirmed" | "done";
  owner_id: number;
  owner_name: string;
}

export interface MeetingNote {
  id: number;
  client_id: number;
  meeting_date: string;
  meeting_type: "Annual" | "Interim" | "Ad hoc";
  body: string;
  author_id: number;
  status: "draft" | "approved";
  approved_by: number | null;
  approved_at: string | null;
  created_at: string;
  // Draft tasks auto-created from this note's "TCFP:"/"Client:" lines -
  // see api/src/meetingNoteActions.ts. Always present (possibly empty),
  // bundled server-side by GET /api/clients/:id and the create/edit
  // meeting-note responses.
  tasks: MeetingNoteTask[];
}

export interface PortfolioLogEntry {
  id: number;
  client_id: number;
  entry_date: string;
  text: string;
  author_id: number;
  created_at: string;
}

export interface PortfolioHolding {
  id: number;
  client_id: number;
  moneyinfo_holding_id: string | null;
  source: "plan" | "investment" | "account";
  provider: string | null;
  plan_type: string | null;
  holding_name: string | null;
  asset_class: string | null;
  value: string | null;
  currency: string;
  as_of_date: string | null;
  synced_at: string;
}

export interface Portfolio {
  summary: string;
  updated_by: number | null;
  updated_at: string | null;
  logs: PortfolioLogEntry[];
  // Structured, sync-derived holdings for asset-allocation charting - see
  // the moneyinfo sync (api/src/sync/). `value` comes back as a string
  // since it's a Postgres numeric column; parse with Number() when charting.
  holdings: PortfolioHolding[];
}

export interface ContactLog {
  id: number;
  client_id: number;
  contact_date: string;
  type: "call" | "email" | "meeting" | "other";
  staff_id: number;
  staff_name: string;
  note: string;
  created_at: string;
}

export interface OutstandingItemChase {
  id: number;
  outstanding_item_id: number;
  chased_at: string;
  chased_by: number;
  chased_by_name: string;
  created_at: string;
}

export interface OutstandingItem {
  id: number;
  client_id: number;
  type: "loa" | "signature" | "transfer";
  description: string;
  owner_id: number;
  owner_name: string;
  raised_at: string;
  status: "outstanding" | "received" | "cancelled";
  created_at: string;
  chases: OutstandingItemChase[];
}

export interface Attachment {
  id: number;
  client_id: number;
  filename: string;
  content_type: string;
  size_bytes: number;
  note: string | null;
  uploaded_by: number;
  uploaded_by_name: string;
  created_at: string;
}

export interface DaysAliveNextMilestone {
  days: number;
  date: string;
  daysUntil: number;
}

export interface DaysAliveAlertSummary {
  id: number;
  milestoneDays: number;
  milestoneDate: string;
  alertDate: string;
  status: "pending" | "sent" | "failed" | "skipped";
  sentAt: string | null;
}

// Always computed fresh from clients.dob when the record is loaded -
// never a stored figure. Null when the client has no date of birth on
// file.
export interface ClientDaysAlive {
  dateOfBirth: string;
  daysAlive: number;
  nextMilestone: DaysAliveNextMilestone | null;
  alerts: DaysAliveAlertSummary[];
}

export interface ClientSpine extends ClientSummary {
  softFacts: SoftFact[];
  points: Point[];
  meetingNotes: MeetingNote[];
  portfolio: Portfolio;
  attachments: Attachment[];
  contactLog: ContactLog[];
  lastContactDate: string | null;
  outstandingItems: OutstandingItem[];
  daysAlive: ClientDaysAlive | null;
}

export interface Task {
  id: number;
  client_id: number;
  text: string;
  owner_id: number;
  due_date: string | null;
  status: "awaiting_sense_check" | "confirmed" | "done";
  source: "manual" | "meeting_note" | "sync";
  confirmed_by: number | null;
  confirmed_at: string | null;
  created_at: string;
  client_first_names: string;
  client_surname: string;
  owner_name: string;
}

export interface Case {
  id: number;
  client_id: number;
  title: string;
  stage: string;
  waiting_on: "us" | "client" | "provider" | "third_party" | null;
  owner_id: number | null;
  opened_at: string;
  stage_updated_at: string;
  closed_at: string | null;
  created_at: string;
  client_first_names: string;
  client_surname: string;
}

export type PrepTask = Omit<Task, "client_first_names" | "client_surname">;

export interface PrepPack extends ClientSummary {
  points: Point[];
  recentSoftFacts: SoftFact[];
  portfolio: {
    summary: string;
    updated_by: number | null;
    updated_at: string | null;
    recentLogs: PortfolioLogEntry[];
    holdings: PortfolioHolding[];
  };
  outstandingTasks: PrepTask[];
  lastMeetingNote: MeetingNote | null;
  recentContactLog: ContactLog[];
  lastContactDate: string | null;
}

export interface OpsReviewDue {
  id: number;
  first_names: string;
  surname: string;
  next_review_date: string;
  next_review_type: "Annual" | "Interim" | "Ad hoc" | null;
  review_cycle: "Annual" | "Interim" | "Ad hoc";
  adviser_id: number;
  adviser_name: string;
  days_until: number;
}

export interface OpsCase {
  id: number;
  client_id: number;
  title: string;
  stage: string;
  waiting_on: "us" | "client" | "provider" | "third_party" | null;
  stage_updated_at: string;
  client_first_names: string;
  client_surname: string;
  idle_days: number;
  // Server-computed against stalledDays below - read this rather than
  // re-deriving idle_days > threshold client-side.
  stalled: boolean;
}

export interface OpsOutstandingItem {
  id: number;
  client_id: number;
  client_first_names: string;
  client_surname: string;
  type: "loa" | "signature" | "transfer";
  description: string;
  owner_id: number;
  owner_name: string;
  raised_at: string;
  days_outstanding: number;
  flagged: boolean;
}

export interface OpsPipelineStage {
  stage: string;
  count: number;
  cases: OpsCase[];
}

export interface OpsWorkload {
  id: number;
  name: string;
  open_tasks: number;
  overdue_tasks: number;
  open_cases: number;
}

export interface OpsGoingQuiet {
  id: number;
  first_names: string;
  surname: string;
  adviser_id: number;
  adviser_name: string;
  last_contact_date: string | null;
  days_since_contact: number | null;
}

export interface OpsDashboard {
  stats: {
    reviewsOverdue: number;
    reviewsDueSoon: number;
    reviewsNoDateSet: number;
    liveCases: number;
    withProvider: number;
    withClient: number;
    stalledCases: number;
  };
  reviewsDue: OpsReviewDue[];
  pipeline: OpsPipelineStage[];
  workload: OpsWorkload[];
  goingQuiet: OpsGoingQuiet[];
  quietDays: number;
  stalledDays: number;
  outstandingItems: {
    stats: { loa: number; signature: number; transfer: number };
    items: OpsOutstandingItem[];
    thresholds: { loa: number; signature: number; transfer: number };
  };
}

export interface StaffUser {
  id: number;
  name: string;
  role: "adviser" | "client_manager" | "admin";
}

export interface AccountUser {
  id: number;
  email: string;
  name: string;
  role: "adviser" | "client_manager" | "admin";
  active: boolean;
  created_at: string;
  last_login_at: string | null;
}

export interface RecentlyDeletedItem {
  entity_type: "soft_fact" | "contact_log" | "attachment" | "outstanding_item";
  entity_id: number;
  client_id: number;
  section: string;
  summary: string;
  meta: string | null;
  deleted_at: string;
  deleted_by_id: number | null;
  deleted_by_name: string | null;
}

export interface DaysAliveSettings {
  id: number;
  enabled: boolean;
  warningDaysBefore: number;
  cardLeadDays: number;
  recipientEmail: string | null;
}

export interface DaysAliveMilestone {
  id: number;
  days: number;
  enabled: boolean;
  created_at: string;
}

export interface DaysAliveAlert {
  id: number;
  client_id: number;
  client_first_names: string;
  client_surname: string;
  milestone_days: number;
  milestone_date: string;
  alert_date: string;
  alert_days_before: number;
  age_years_on_milestone: number;
  status: "pending" | "sent" | "failed" | "skipped";
  recipient: string | null;
  email_subject: string | null;
  error_message: string | null;
  created_at: string;
  sent_at: string | null;
  job_run_id: number | null;
}

export interface DaysAliveJobRun {
  id: number;
  run_date: string;
  started_at: string;
  finished_at: string | null;
  clients_checked: number;
  alerts_sent: number;
  alerts_skipped: number;
  alerts_failed: number;
}

export interface DaysAliveMatch {
  clientId: number;
  fullName: string;
  milestoneDays: number;
  milestoneDate: string;
  alertDate: string;
  ageOnMilestone: number;
}

export interface DaysAlivePreview {
  fromDate: string;
  toDate: string;
  matches: DaysAliveMatch[];
}

export interface DaysAliveRunResult {
  jobRunId: number | null;
  runDate: string;
  featureEnabled: boolean;
  clientsChecked: number;
  clientsSkippedNoDob: number;
  alertsSent: number;
  alertsSkipped: number;
  alertsFailed: number;
}

export interface DaysAliveDiagnosis {
  clientId: number;
  dateOfBirth: string | null;
  milestoneDays: number;
  milestoneDate: string | null;
  alertDate: string | null;
  evaluationDate: string;
  daysAliveOnEvaluationDate: number | null;
  milestoneEnabled: boolean | null;
  alertRecordExists: boolean;
  alertStatus: "pending" | "sent" | "failed" | "skipped" | null;
  emailSent: boolean;
  failureReason: string | null;
}

export interface SearchResult {
  entity_type: "soft_fact" | "point" | "meeting_note" | "portfolio_summary";
  entity_id: number;
  client_id: number;
  client_first_names: string;
  client_surname: string;
  excerpt: string;
  entry_date: string | null;
  rank: number;
}
