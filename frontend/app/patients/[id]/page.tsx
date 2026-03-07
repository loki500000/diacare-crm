"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getPatient, getCallLogs, addCareNote, updatePatient, getScripts, PatientDetail, CallLog, VitalsSnapshot, CallScript } from "@/lib/api";
import CallScheduleModal from "@/components/CallScheduleModal";
import SimulateCallModal from "@/components/SimulateCallModal";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { toast } from "sonner";

const SEVERITY_BADGE: Record<string, string> = {
  critical: "bg-red-100 text-red-700",
  high: "bg-amber-100 text-amber-700",
  medium: "bg-blue-100 text-blue-700",
  low: "bg-emerald-100 text-emerald-700",
};

export default function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [patient, setPatient] = useState<PatientDetail | null>(null);
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [scripts, setScripts] = useState<CallScript[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [simulateOpen, setSimulateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [notePriority, setNotePriority] = useState("medium");
  const [addingNote, setAddingNote] = useState(false);
  const [actionLog, setActionLog] = useState<CallLog | null>(null);

  async function load() {
    setLoading(true);
    setLoadError("");
    try {
      const [p, logs] = await Promise.all([getPatient(id), getCallLogs(id)]);
      setPatient(p);
      setCallLogs(logs);
    } catch {
      setLoadError("Could not reach backend. Is the server running on port 8001?");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    getScripts().then(setScripts).catch(() => {});
  }, [id]);

  async function submitNote() {
    if (!noteText.trim() || !patient) return;
    setAddingNote(true);
    try {
      await addCareNote(patient.id, { note: noteText, priority: notePriority, created_by: "Care Team" });
      setNoteText("");
      toast.success("Care note saved");
      await load();
    } finally { setAddingNote(false); }
  }

  if (loading) return <div className="p-8 text-slate-400">Loading patient...</div>;
  if (loadError) return (
    <div className="p-8">
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-start gap-4">
        <span className="material-symbols-outlined text-red-500 mt-0.5">wifi_off</span>
        <div>
          <p className="font-bold text-red-700">Backend Offline</p>
          <p className="text-sm text-red-600 mt-1">{loadError}</p>
          <p className="text-xs text-red-500 mt-2 font-mono">cd crm-backend &amp;&amp; python main.py</p>
          <button onClick={load} className="mt-3 text-sm font-bold text-red-700 underline">Retry</button>
        </div>
      </div>
    </div>
  );
  if (!patient) return <div className="p-8 text-red-500">Patient not found.</div>;

  const meds = Array.isArray(patient.medications) ? patient.medications : [];
  const vitals = patient.vitals || {};
  const vitalsHistory: VitalsSnapshot[] = Array.isArray(patient.vitals_history) ? patient.vitals_history : [];
  const avatarColor = SEVERITY_BADGE[patient.severity] || "bg-slate-100 text-slate-600";

  return (
    <div className="flex flex-col min-h-full">
      {/* Sticky header */}
      <header className="h-16 border-b border-slate-200 bg-white/80 backdrop-blur-md flex items-center justify-between px-8 sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="text-slate-400 hover:text-slate-700">
            <span className="material-symbols-outlined" style={{fontSize:22}}>arrow_back</span>
          </button>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${avatarColor}`}>
            {patient.initials || patient.name.slice(0,2).toUpperCase()}
          </div>
          <div>
            <h2 className="font-bold text-slate-900">
              {patient.name}
              <span className="text-slate-400 font-normal ml-2 text-base">{patient.phone}</span>
            </h2>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_BADGE[patient.severity] || "bg-slate-100 text-slate-700"}`}>
                {patient.condition}
              </span>
              {patient.created_at && (
                <span className="text-xs text-slate-500">
                  Added: {format(new Date(patient.created_at), "MMM d, yyyy")}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setEditOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-all"
          >
            <span className="material-symbols-outlined" style={{fontSize:16}}>edit</span>
            Edit
          </button>
          <button
            onClick={() => setScheduleOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#1a59d5] text-white rounded-lg text-sm font-semibold hover:bg-[#1548b8] transition-all shadow-sm"
          >
            <span className="material-symbols-outlined" style={{fontSize:16}}>calendar_month</span>
            Schedule Follow-up
          </button>
          <button
            onClick={() => setSimulateOpen(true)}
            className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg"
            title="Simulate Call"
          >
            <span className="material-symbols-outlined" style={{fontSize:22}}>phone_in_talk</span>
          </button>
        </div>
      </header>

      <div className="p-8 space-y-8">
        {/* 5-Second Summary */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <span className="material-symbols-outlined text-[#1a59d5]" style={{fontSize:22}}>bolt</span>
              5-Second Summary
            </h3>
            <span className="text-xs text-slate-500 italic">Syncing from patient records</span>
          </div>
          <div className="grid grid-cols-3 gap-6">
            <VitalCard
              label="HbA1c"
              value={vitals.hba1c != null ? `${vitals.hba1c}%` : "—"}
              status={vitals.hba1c != null ? (vitals.hba1c < 7 ? "Good" : vitals.hba1c < 9 ? "Elevated" : "High") : "—"}
              statusColor={vitals.hba1c != null ? (vitals.hba1c < 7 ? "text-green-600 bg-green-100" : vitals.hba1c < 9 ? "text-amber-600 bg-amber-100" : "text-red-600 bg-red-100") : "text-slate-400 bg-slate-100"}
              trend={vitals.hba1c != null && vitals.hba1c < 7 ? "↓ improving" : "↑ monitor"}
              trendColor={vitals.hba1c != null && vitals.hba1c < 7 ? "text-green-600" : "text-rose-600"}
              sparkColor="#1a59d5"
              history={vitalsHistory.map(h => h.hba1c ?? 0).filter(Boolean)}
            />
            <VitalCard
              label="Avg Blood Sugar"
              value={vitals.fasting_glucose != null ? `${vitals.fasting_glucose} mg/dL` : "—"}
              status={vitals.fasting_glucose != null ? (vitals.fasting_glucose < 126 ? "Normal" : "Elevated") : "—"}
              statusColor={vitals.fasting_glucose != null ? (vitals.fasting_glucose < 126 ? "text-green-600 bg-green-100" : "text-amber-600 bg-amber-100") : "text-slate-400 bg-slate-100"}
              trend={vitals.fasting_glucose != null && vitals.fasting_glucose >= 126 ? "↑ elevated" : "stable"}
              trendColor={vitals.fasting_glucose != null && vitals.fasting_glucose >= 126 ? "text-rose-600" : "text-slate-400"}
              sparkColor="#f59e0b"
              history={vitalsHistory.map(h => h.fasting_glucose ?? 0).filter(Boolean)}
            />
            <VitalCard
              label="Body Weight"
              value={vitals.weight_kg != null ? `${vitals.weight_kg} kg` : "—"}
              status="Stable"
              statusColor="text-slate-500 bg-slate-100"
              trend="No change"
              trendColor="text-slate-400"
              sparkColor="#94a3b8"
              history={vitalsHistory.map(h => h.weight_kg ?? 0).filter(Boolean)}
              isBar
            />
          </div>
        </section>

        <div className="grid grid-cols-3 gap-8">
          {/* Left: Call History */}
          <div className="col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-[#1a59d5]" style={{fontSize:22}}>record_voice_over</span>
                Voice AI &amp; Call History
              </h3>
              <button
                onClick={() => setSimulateOpen(true)}
                className="text-sm font-medium text-[#1a59d5] hover:underline"
              >
                + Simulate call
              </button>
            </div>

            {callLogs.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">
                No call history yet. Use &ldquo;Simulate Call&rdquo; to test the voice agent.
              </div>
            ) : callLogs.map((log) => (
              <CallLogCard
                key={log.id}
                log={log}
                onTakeAction={() => { setActionLog(log); setScheduleOpen(true); }}
              />
            ))}
          </div>

          {/* Right: Medications + Lifestyle + Care Notes */}
          <div className="space-y-8">
            {/* Call Protocol */}
            <section>
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-[#1a59d5]" style={{fontSize:22}}>settings_voice</span>
                AI Call Protocol
              </h3>
              <div className="bg-[#1a59d5]/5 border border-[#1a59d5]/20 rounded-xl p-4 space-y-2 text-sm">
                {/* Script assignment */}
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-700 shrink-0">Script:</span>
                  <select
                    className="flex-1 text-xs border border-[#1a59d5]/30 bg-white rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-[#1a59d5]"
                    value={patient.call_script_id || ""}
                    onChange={async e => {
                      const newId = e.target.value || null;
                      await updatePatient(patient.id, { call_script_id: newId as any });
                      load();
                    }}
                  >
                    <option value="">System Default</option>
                    {scripts.map(s => (
                      <option key={s.id} value={s.id}>{s.name}{s.is_default ? " ★" : ""}</option>
                    ))}
                  </select>
                </div>
                {patient.call_protocol?.call_count_per_week && (
                  <p><span className="font-bold text-slate-700">Frequency:</span> {patient.call_protocol.call_count_per_week}× per week</p>
                )}
                {patient.call_protocol?.preferred_times?.length && (
                  <p><span className="font-bold text-slate-700">Preferred time:</span> {patient.call_protocol.preferred_times.join(", ")}</p>
                )}
                {patient.call_protocol?.ai_focus_areas?.length && (
                  <div>
                    <span className="font-bold text-slate-700">AI asks about:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {patient.call_protocol.ai_focus_areas.map(f => (
                        <span key={f} className="px-2 py-0.5 bg-[#1a59d5]/10 text-[#1a59d5] text-xs rounded-full">{f}</span>
                      ))}
                    </div>
                  </div>
                )}
                {patient.call_protocol?.custom_instructions && (
                  <p className="text-xs text-slate-600 italic">"{patient.call_protocol.custom_instructions}"</p>
                )}
              </div>
            </section>

            {/* Medication Log */}
            <section>
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-[#1a59d5]" style={{fontSize:22}}>pill</span>
                Medication Log
              </h3>
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Current Medications</span>
                  <span className="text-xs font-bold text-green-600">{patient.compliance_score}% Adherence</span>
                </div>
                {meds.length === 0 ? (
                  <p className="text-xs text-slate-400">No medications recorded.</p>
                ) : (
                  <div className="space-y-5">
                    {meds.map((med: any, i: number) => (
                      <div key={i} className="space-y-2">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="text-sm font-bold">{med.name}</p>
                            {med.friendly_name && (
                              <p className="text-[10px] text-slate-400 italic">"{med.friendly_name}"</p>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-500">{med.dose} · {med.frequency}</p>
                        </div>
                        <div className="flex gap-1.5 h-5">
                          {Array.from({length: 7}).map((_, d) => {
                            const adherencePct = patient.compliance_score / 100;
                            const taken = Math.random() < adherencePct;
                            const pending = d === 6;
                            return (
                              <div key={d} className={`flex-1 rounded-sm ${pending ? "bg-slate-100" : taken ? "bg-[#1a59d5]" : "bg-rose-400"}`} />
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium mt-2">
                      {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => (
                        <span key={d} className={d === "Sun" ? "text-[#1a59d5] font-bold" : ""}>{d}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Lifestyle */}
            {patient.lifestyle && Object.keys(patient.lifestyle).length > 0 && (
              <section>
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#1a59d5]" style={{fontSize:22}}>directions_run</span>
                  Lifestyle Adherence
                </h3>
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                  {Object.entries(patient.lifestyle).map(([k, v], i) => (
                    <div key={k} className={`p-4 flex items-center gap-4 ${i > 0 ? "border-t border-slate-100" : ""}`}>
                      <span className="material-symbols-outlined text-slate-400" style={{fontSize:20}}>
                        {k === "exercise" ? "fitness_center" : k === "diet" ? "restaurant" : k === "smoking" ? "smoking_rooms" : "local_drink"}
                      </span>
                      <div>
                        <p className="text-sm font-bold capitalize">{k}</p>
                        <p className="text-xs text-slate-500 capitalize">{String(v)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Diet Rules */}
            {patient.diet_rules && patient.diet_rules.length > 0 && (
              <section>
                <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#1a59d5]" style={{fontSize:22}}>restaurant</span>
                  Diet Rules
                </h3>
                <div className="flex flex-wrap gap-2">
                  {patient.diet_rules.map((rule: string) => (
                    <span key={rule} className="px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium rounded-full">
                      {rule}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* Care Notes */}
            <section>
              <h3 className="text-lg font-bold mb-4">Care Notes</h3>
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <Textarea
                  className="w-full bg-slate-50 border-none rounded-lg text-sm placeholder:text-slate-400 focus:ring-1 focus:ring-[#1a59d5] min-h-[100px] resize-none"
                  placeholder={`Add a private note about ${patient.name.split(" ")[0]}'s progress...`}
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                />
                <div className="mt-2 flex items-center justify-between">
                  <Select value={notePriority} onValueChange={setNotePriority}>
                    <SelectTrigger className="w-36 h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">High priority</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                  <button
                    onClick={submitNote}
                    disabled={addingNote || !noteText.trim()}
                    className="text-xs font-bold text-[#1a59d5] hover:underline disabled:opacity-40"
                  >
                    Save Note
                  </button>
                </div>

                {patient.care_notes.length > 0 && (
                  <div className="mt-4 space-y-2 border-t border-slate-100 pt-3 max-h-48 overflow-y-auto">
                    {patient.care_notes.map(note => (
                      <div key={note.id} className={`p-2.5 rounded-lg text-xs border ${
                        note.priority === "high" ? "border-red-200 bg-red-50" :
                        note.priority === "medium" ? "border-amber-200 bg-amber-50" :
                        "border-slate-200 bg-slate-50"
                      }`}>
                        <p className="text-slate-800">{note.note}</p>
                        <p className="text-slate-400 mt-1">{note.created_by} · {format(new Date(note.created_at), "MMM d")}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>

      <CallScheduleModal
        patient={patient}
        open={scheduleOpen}
        onClose={() => { setScheduleOpen(false); setActionLog(null); }}
        onSuccess={() => { toast.success("Follow-up scheduled"); load(); }}
        prefillNote={actionLog?.outcome || undefined}
      />
      <SimulateCallModal patient={patient} open={simulateOpen} onClose={() => setSimulateOpen(false)} onCallEnd={load} />
      {patient && (
        <EditPatientModal patient={patient} open={editOpen} onClose={() => setEditOpen(false)} onSuccess={() => { toast.success("Patient updated"); load(); }} scripts={scripts} />
      )}
    </div>
  );
}

// ─── Call Log Card ─────────────────────────────────────────────────────────────
function CallLogCard({ log, onTakeAction }: { log: CallLog; onTakeAction: () => void }) {
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center">
            <span className="material-symbols-outlined" style={{fontSize:20}}>call</span>
          </div>
          <div>
            <p className="font-bold text-sm">DiaCare AI Check-in</p>
            <p className="text-xs text-slate-500">
              {format(new Date(log.started_at), "MMM d, yyyy 'at' h:mm a")}
              {log.duration_secs ? ` • ${Math.floor(log.duration_secs / 60)}m ${log.duration_secs % 60}s` : ""}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {log.sentiment !== "unknown" && (
            <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
              log.sentiment === "positive" ? "bg-green-50 text-green-700 ring-green-600/10" :
              log.sentiment === "negative" ? "bg-rose-50 text-rose-700 ring-rose-600/10" :
              "bg-blue-50 text-blue-700 ring-blue-700/10"
            }`}>{log.sentiment.charAt(0).toUpperCase() + log.sentiment.slice(1)} Sentiment</span>
          )}
        </div>
      </div>
      <div className="p-6 space-y-4">
        {log.summary ? (
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Summary</p>
            <p className="text-sm text-slate-600 leading-relaxed">{log.summary}</p>
          </div>
        ) : (
          <p className="text-sm text-slate-400 italic">No summary recorded.</p>
        )}

        {/* Transcript viewer */}
        {log.transcript && log.transcript.length > 0 && (
          <div>
            <button
              onClick={() => setTranscriptOpen(o => !o)}
              className="text-xs font-bold text-[#1a59d5] flex items-center gap-1 hover:underline"
            >
              <span className="material-symbols-outlined" style={{fontSize:14}}>{transcriptOpen ? "expand_less" : "expand_more"}</span>
              {transcriptOpen ? "Hide" : "Show"} Transcript ({log.transcript.length} turns)
            </button>
            {transcriptOpen && (
              <div className="mt-3 space-y-2 max-h-48 overflow-y-auto border border-slate-100 rounded-lg p-3 bg-slate-50">
                {log.transcript.map((turn: any, i: number) => (
                  <div key={i} className={`text-xs ${turn.role === "assistant" ? "text-[#1a59d5]" : "text-slate-700"}`}>
                    <span className="font-bold uppercase mr-1">{turn.role === "assistant" ? "AI" : "Patient"}:</span>
                    {turn.content || turn.text || JSON.stringify(turn)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {log.outcome && (
          <div className="flex gap-4">
            <div className="flex-1 p-3 bg-amber-50 rounded-lg border border-amber-100">
              <p className="text-xs font-bold text-amber-700 mb-1 flex items-center gap-1">
                <span className="material-symbols-outlined" style={{fontSize:14}}>warning</span> AI Insight
              </p>
              <p className="text-xs text-amber-900">{log.outcome}</p>
            </div>
            <button onClick={onTakeAction} className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold self-end hover:bg-slate-700">
              Take Action
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Vital Card ─────────────────────────────────────────────────────────────────
function VitalCard({ label, value, status, statusColor, trend, trendColor, sparkColor, history = [], isBar }: {
  label: string; value: string; status: string; statusColor: string;
  trend: string; trendColor: string; sparkColor: string; history?: number[]; isBar?: boolean;
}) {
  const pts = history.length >= 2 ? history : [0, 0, 0, 0, 0, 0, 0];
  const max = Math.max(...pts, 1);
  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
      <div className="flex justify-between items-start mb-4">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${statusColor}`}>{status}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <p className="text-4xl font-black text-slate-900">{value}</p>
        <span className={`text-sm font-medium flex items-center ${trendColor}`}>
          <span className="material-symbols-outlined" style={{fontSize:14}}>
            {trend.startsWith("↑") ? "trending_up" : trend.startsWith("↓") ? "trending_down" : "remove"}
          </span>
          {trend.replace("↑ ","").replace("↓ ","")}
        </span>
      </div>
      <div className="mt-4 h-16 w-full">
        {isBar ? (
          <div className="flex items-end justify-between gap-1 h-full">
            {pts.slice(-7).map((h, i, arr) => (
              <div key={i} className={`flex-1 rounded-t-sm ${i === arr.length - 1 ? "opacity-60" : ""}`}
                style={{height:`${(h / max) * 100}%`, background: sparkColor}} />
            ))}
          </div>
        ) : (
          <svg className="w-full h-full" viewBox="0 0 100 40" preserveAspectRatio="none">
            {pts.length >= 2 ? (
              <>
                <polyline
                  points={pts.slice(-7).map((v, i, arr) => `${(i / (arr.length - 1)) * 100},${40 - (v / max) * 36}`).join(" ")}
                  fill="none" stroke={sparkColor} strokeWidth="2" vectorEffect="non-scaling-stroke"
                />
                <polygon
                  points={`0,40 ${pts.slice(-7).map((v, i, arr) => `${(i / (arr.length - 1)) * 100},${40 - (v / max) * 36}`).join(" ")} 100,40`}
                  fill={sparkColor} fillOpacity="0.1"
                />
              </>
            ) : (
              <path d="M0 35 Q 20 30, 40 25 T 80 15 T 100 10" fill="none" stroke={sparkColor} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeDasharray="4 2" />
            )}
          </svg>
        )}
      </div>
    </div>
  );
}

// ─── Edit Patient Modal ─────────────────────────────────────────────────────────
function EditPatientModal({ patient, open, onClose, onSuccess, scripts }: {
  patient: PatientDetail; open: boolean; onClose: () => void; onSuccess: () => void; scripts: CallScript[];
}) {
  const [form, setForm] = useState({
    name: patient.name,
    phone: patient.phone || "",
    condition: patient.condition,
    severity: patient.severity,
    risk_reason: patient.risk_reason || "",
    hba1c: String(patient.vitals?.hba1c ?? ""),
    bp: String(patient.vitals?.bp ?? ""),
    fasting_glucose: String(patient.vitals?.fasting_glucose ?? ""),
    weight_kg: String(patient.vitals?.weight_kg ?? ""),
    compliance_score: String(patient.compliance_score),
    call_script_id: patient.call_script_id || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function submit() {
    setSaving(true); setError("");
    try {
      const vitalsObj: Record<string, any> = { ...(patient.vitals || {}) };
      if (form.hba1c) vitalsObj.hba1c = parseFloat(form.hba1c);
      if (form.bp) vitalsObj.bp = form.bp;
      if (form.fasting_glucose) vitalsObj.fasting_glucose = parseFloat(form.fasting_glucose);
      if (form.weight_kg) vitalsObj.weight_kg = parseFloat(form.weight_kg);

      // Append to vitals history
      const newSnapshot = {
        date: new Date().toISOString().slice(0, 10),
        ...(form.hba1c ? { hba1c: parseFloat(form.hba1c) } : {}),
        ...(form.bp ? { bp: form.bp } : {}),
        ...(form.fasting_glucose ? { fasting_glucose: parseFloat(form.fasting_glucose) } : {}),
        ...(form.weight_kg ? { weight_kg: parseFloat(form.weight_kg) } : {}),
      };
      const history = [...(Array.isArray(patient.vitals_history) ? patient.vitals_history : []), newSnapshot];

      await updatePatient(patient.id, {
        name: form.name,
        phone: form.phone,
        condition: form.condition,
        severity: form.severity as any,
        risk_reason: form.risk_reason,
        vitals: vitalsObj,
        vitals_history: history,
        compliance_score: parseInt(form.compliance_score) || 0,
        call_script_id: form.call_script_id || undefined,
      });
      onSuccess(); onClose();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Edit Patient — {patient.name}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 col-span-2"><Label>Full Name</Label><Input value={form.name} onChange={e => set("name", e.target.value)} /></div>
            <div className="space-y-1"><Label>Phone</Label><Input value={form.phone} onChange={e => set("phone", e.target.value)} /></div>
            <div className="space-y-1"><Label>Compliance Score (%)</Label><Input type="number" min="0" max="100" value={form.compliance_score} onChange={e => set("compliance_score", e.target.value)} /></div>
            <div className="space-y-1 col-span-2"><Label>Condition</Label><Input value={form.condition} onChange={e => set("condition", e.target.value)} /></div>
            <div className="space-y-1">
              <Label>Risk Level</Label>
              <Select value={form.severity} onValueChange={v => set("severity", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Risk Reason</Label><Input value={form.risk_reason} onChange={e => set("risk_reason", e.target.value)} /></div>
          </div>
          <div className="space-y-1 col-span-2">
            <Label>Call Script</Label>
            <Select value={form.call_script_id} onValueChange={v => set("call_script_id", v)}>
              <SelectTrigger><SelectValue placeholder="System Default" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">System Default</SelectItem>
                {scripts.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}{s.is_default ? " ★" : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider border-t pt-3">Update Vitals (adds to history)</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>HbA1c (%)</Label><Input type="number" step="0.1" value={form.hba1c} onChange={e => set("hba1c", e.target.value)} /></div>
            <div className="space-y-1"><Label>Blood Pressure</Label><Input value={form.bp} onChange={e => set("bp", e.target.value)} placeholder="130/85" /></div>
            <div className="space-y-1"><Label>Fasting Glucose (mg/dL)</Label><Input type="number" value={form.fasting_glucose} onChange={e => set("fasting_glucose", e.target.value)} /></div>
            <div className="space-y-1"><Label>Weight (kg)</Label><Input type="number" value={form.weight_kg} onChange={e => set("weight_kg", e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-[#1a59d5] hover:bg-[#1548b8]">{saving ? "Saving..." : "Save Changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
