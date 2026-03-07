const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Patients ──────────────────────────────────────────────────────────────────
export const getPatients = (params?: {
  search?: string;
  severity?: string;
  sort?: string;
  page?: number;
  limit?: number;
}) => {
  const qs = params ? "?" + new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))
  ).toString() : "";
  return req<PatientsResponse>(`/api/patients${qs}`);
};
export const getPatient = (id: string) => req<PatientDetail>(`/api/patients/${id}`);
export const createPatient = (data: Partial<Patient>) =>
  req<Patient>("/api/patients", { method: "POST", body: JSON.stringify(data) });
export const updatePatient = (id: string, data: Partial<Patient>) =>
  req<Patient>(`/api/patients/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const snoozePatient = (id: string) =>
  req<{ ok: boolean; snoozed_count: number }>(`/api/patients/${id}/snooze`, { method: "POST" });

// ── Schedules ─────────────────────────────────────────────────────────────────
export const getPatientSchedules = (patientId: string) =>
  req<CallSchedule[]>(`/api/patients/${patientId}/schedules`);
export const createSchedule = (patientId: string, data: Partial<CallSchedule>) =>
  req<CallSchedule>(`/api/patients/${patientId}/schedules`, { method: "POST", body: JSON.stringify(data) });
export const getAllSchedules = (status?: string) =>
  req<CallSchedule[]>(`/api/schedules${status ? `?status=${status}` : ""}`);
export const updateSchedule = (id: string, data: Partial<CallSchedule>) =>
  req<CallSchedule>(`/api/schedules/${id}`, { method: "PUT", body: JSON.stringify(data) });

// ── Call Logs ─────────────────────────────────────────────────────────────────
export const getCallLogs = (patientId: string) =>
  req<CallLog[]>(`/api/patients/${patientId}/call-logs`);
export const createCallLog = (patientId: string, data: Partial<CallLog>) =>
  req<CallLog>(`/api/patients/${patientId}/call-logs`, { method: "POST", body: JSON.stringify(data) });
export const updateCallLog = (patientId: string, logId: string, data: Partial<CallLog>) =>
  req<CallLog>(`/api/patients/${patientId}/call-logs/${logId}`, { method: "PUT", body: JSON.stringify(data) });

// ── Care Notes ────────────────────────────────────────────────────────────────
export const addCareNote = (
  patientId: string,
  data: { note: string; priority: string; created_by: string }
) => req<CareNote>(`/api/patients/${patientId}/care-notes`, { method: "POST", body: JSON.stringify(data) });

// ── Asterisk Outbound Call ────────────────────────────────────────────────────
export const originateCall = (patientId: string, context?: string) =>
  req<{ ok: boolean; call_log_id: string; channel_id: string; patient_name: string; phone: string; context: string }>(
    "/api/calls/originate",
    { method: "POST", body: JSON.stringify({ patient_id: patientId, context }) }
  );

// ── Stats ─────────────────────────────────────────────────────────────────────
export const getStats = () => req<Stats>("/api/stats");

// ── Settings ──────────────────────────────────────────────────────────────────
export const getSettings = () => req<Record<string, string>>("/api/settings");
export const saveSettings = (data: Record<string, string>) =>
  req<{ ok: boolean }>("/api/settings", { method: "PUT", body: JSON.stringify(data) });

// ── Scripts ───────────────────────────────────────────────────────────────────
export const getScripts = () => req<CallScript[]>("/api/scripts");
export const getScript = (id: string) => req<CallScript>(`/api/scripts/${id}`);
export const createScript = (data: Partial<CallScript>) =>
  req<CallScript>("/api/scripts", { method: "POST", body: JSON.stringify(data) });
export const updateScript = (id: string, data: Partial<CallScript>) =>
  req<CallScript>(`/api/scripts/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteScript = (id: string) =>
  req<{ ok: boolean }>(`/api/scripts/${id}`, { method: "DELETE" });
export const setDefaultScript = (id: string) =>
  req<CallScript>(`/api/scripts/${id}/set-default`, { method: "POST" });
// ── Types ─────────────────────────────────────────────────────────────────────
export type Severity = "critical" | "high" | "medium" | "low";

export interface VitalsSnapshot {
  date: string;
  hba1c?: number;
  bp?: string;
  fasting_glucose?: number;
  weight_kg?: number;
}

export interface CallProtocol {
  call_count_per_week?: number;
  preferred_times?: string[];
  ai_focus_areas?: string[];
  custom_instructions?: string;
}

export interface Medication {
  name: string;
  dose: string;
  frequency: string;
  friendly_name?: string;
}

export interface Patient {
  id: string;
  name: string;
  initials: string;
  phone: string;
  condition: string;
  severity: Severity;
  risk_reason: string;
  vitals: Record<string, any>;
  vitals_history: VitalsSnapshot[];
  compliance_score: number;
  lifestyle: Record<string, any>;
  medications: Medication[];
  call_protocol: CallProtocol;
  diet_rules: string[];
  call_script_id?: string;
  created_at: string;
  // Enriched by backend list endpoint
  last_call_date?: string;
  last_call_summary?: string;
  last_call_sentiment?: string;
  last_call_outcome?: string;
}

export interface PatientDetail extends Patient {
  care_notes: CareNote[];
  recent_call_logs: CallLog[];
}

export interface PatientsResponse {
  patients: Patient[];
  severity_counts: SeverityCounts;
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface CallSchedule {
  id: string;
  patient_id: string;
  scheduled_at: string;
  recurrence: "none" | "daily" | "weekly";
  status: "pending" | "completed" | "missed" | "cancelled";
  notes: string;
  created_at: string;
  patients?: { name: string; initials: string; severity: Severity };
}

export interface CallLog {
  id: string;
  patient_id: string;
  schedule_id?: string;
  started_at: string;
  ended_at?: string;
  duration_secs?: number;
  transcript: any[];
  summary?: string;
  sentiment: "positive" | "neutral" | "negative" | "unknown";
  outcome?: string;
  tool_calls: any[];
  recording_filename?: string;
}

export interface CareNote {
  id: string;
  patient_id: string;
  note: string;
  priority: "high" | "medium" | "low";
  created_at: string;
  created_by: string;
}

export interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface Stats {
  total_patients: number;
  severity_counts: SeverityCounts;
  schedule_counts: { pending: number; completed: number; missed: number; cancelled: number };
  total_calls: number;
  total_call_duration_secs: number;
  avg_call_duration_secs: number;
  sentiment_counts: { positive: number; neutral: number; negative: number; unknown: number };
  pickup_rate: number;
  calls_by_day: number[];
  calls_by_week: number[];
  avg_compliance: number;
}

// ── Call Script Types ──────────────────────────────────────────────────────────
export type NodeType = "speak" | "smart_extract" | "branch" | "write_db" | "care_alert" | "end";

export interface DbTarget {
  table: string;
  field: string;
  subfield?: string;
  priority?: string;
}

export interface FlowNode {
  id: string;
  type: NodeType;
  label: string;
  position: { x: number; y: number };
  // speak
  text?: string;
  // smart_extract
  ai_question?: string;
  rules_source?: string;
  loop_over?: string;
  output_var?: string;
  db_target?: DbTarget;
  // branch
  condition?: string;
  // care_alert
  message?: string;
  // end
  farewell?: string;
  // write_db
  value_from?: string;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  sourceHandle?: string;
}

export interface CallScript {
  id: string;
  name: string;
  description?: string;
  language: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  is_default: boolean;
  created_at: string;
  updated_at?: string;
}

export const DB_SCHEMA_MAP = {
  patients: {
    vitals: ["hba1c", "bp", "fasting_glucose", "weight_kg"],
    lifestyle: ["diet", "exercise", "smoking", "alcohol"],
    medications: ["adherence"],
  },
  care_notes: { note: null, priority: ["high", "medium", "low"] },
  call_logs: { outcome: null, sentiment: ["positive", "neutral", "negative"] },
} as const;
