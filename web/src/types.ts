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

export interface Portfolio {
  summary: string;
  updated_by: number | null;
  updated_at: string | null;
  logs: PortfolioLogEntry[];
}

export interface ClientSpine extends ClientSummary {
  softFacts: SoftFact[];
  points: Point[];
  meetingNotes: MeetingNote[];
  portfolio: Portfolio;
}
