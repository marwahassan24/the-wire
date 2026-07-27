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

export interface ClientSpine extends ClientSummary {
  softFacts: SoftFact[];
  points: Point[];
  meetingNotes: MeetingNote[];
  portfolio: Portfolio;
  attachments: Attachment[];
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
  };
  outstandingTasks: PrepTask[];
  lastMeetingNote: MeetingNote | null;
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
}

export interface StaffUser {
  id: number;
  name: string;
  role: "adviser" | "client_manager" | "admin";
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
