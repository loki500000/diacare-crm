"use client";
import { useEffect, useState } from "react";
import { getPatients, createPatient, getScripts, Patient, CallScript } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Link from "next/link";
import { toast } from "sonner";
import { format } from "date-fns";
import CallScheduleModal from "@/components/CallScheduleModal";

const AVATAR_COLORS = [
  "bg-[#1a59d5]/20 text-[#1a59d5]",
  "bg-blue-100 text-blue-600",
  "bg-emerald-100 text-emerald-600",
  "bg-purple-100 text-purple-600",
  "bg-rose-100 text-rose-600",
  "bg-amber-100 text-amber-600",
];

function complianceColor(score: number) {
  if (score >= 80) return "bg-[#1a59d5]";
  if (score >= 60) return "bg-amber-500";
  return "bg-rose-500";
}

function conditionPill(condition: string) {
  const c = condition.toLowerCase();
  if (c.includes("type 1") || c.includes("type-1")) return "bg-red-100 text-red-700";
  if (c.includes("type 2") || c.includes("type-2")) return "bg-orange-100 text-orange-700";
  if (c.includes("pre")) return "bg-blue-100 text-blue-700";
  if (c.includes("gestational")) return "bg-purple-100 text-purple-700";
  return "bg-slate-100 text-slate-700";
}

function conditionShort(condition: string) {
  const c = condition.toLowerCase();
  if (c.includes("type 1") || c.includes("type-1")) return "Type-1";
  if (c.includes("type 2") || c.includes("type-2")) return "Type-2";
  if (c.includes("pre")) return "Pre-diabetic";
  if (c.includes("gestational")) return "Gestational";
  return condition.slice(0, 12);
}

function bpStatus(bp: string) {
  if (!bp) return { text: "—", color: "text-slate-400" };
  const [sys] = bp.split("/").map(Number);
  if (sys >= 140) return { text: "Elevated", color: "text-rose-500" };
  if (sys >= 130) return { text: "High Normal", color: "text-amber-500" };
  return { text: "Stable", color: "text-emerald-500" };
}

type SortKey = "created_at" | "compliance_score" | "name";

export default function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [query, setQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [scheduleTarget, setScheduleTarget] = useState<Patient | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  // Advanced filter state
  const [filterCondition, setFilterCondition] = useState("");
  const [filterHba1cMin, setFilterHba1cMin] = useState("");
  const [filterHba1cMax, setFilterHba1cMax] = useState("");
  const [filterComplianceMin, setFilterComplianceMin] = useState("");
  const [filterComplianceMax, setFilterComplianceMax] = useState("");

  const LIMIT = 10;

  async function load(p = page) {
    setLoading(true);
    setError("");
    try {
      const res = await getPatients({
        search: query || undefined,
        severity: severityFilter !== "all" ? severityFilter : undefined,
        sort: sortKey,
        page: p,
        limit: LIMIT,
      });
      let pts = res.patients;

      // Client-side advanced filter
      if (filterCondition) {
        const fc = filterCondition.toLowerCase();
        pts = pts.filter(p => p.condition.toLowerCase().includes(fc));
      }
      if (filterHba1cMin || filterHba1cMax) {
        pts = pts.filter(p => {
          const h = p.vitals?.hba1c;
          if (h == null) return false;
          if (filterHba1cMin && h < parseFloat(filterHba1cMin)) return false;
          if (filterHba1cMax && h > parseFloat(filterHba1cMax)) return false;
          return true;
        });
      }
      if (filterComplianceMin || filterComplianceMax) {
        pts = pts.filter(p => {
          const c = p.compliance_score;
          if (filterComplianceMin && c < parseInt(filterComplianceMin)) return false;
          if (filterComplianceMax && c > parseInt(filterComplianceMax)) return false;
          return true;
        });
      }

      setPatients(pts);
      setTotal(res.total);
      setPages(res.pages);
    } catch {
      setError("Failed to load patients. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => { setPage(1); load(1); }, 300);
    return () => clearTimeout(t);
  }, [query, severityFilter, sortKey]);

  useEffect(() => { load(page); }, [page]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(a => !a);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  function exportCSV() {
    const headers = ["Name", "Phone", "Condition", "Severity", "HbA1c", "Compliance", "BP", "Last Call", "Risk Reason"];
    const rows = patients.map(p => [
      p.name, p.phone || "", p.condition, p.severity,
      p.vitals?.hba1c ?? "", p.compliance_score,
      p.vitals?.bp ?? "",
      p.last_call_date ? format(new Date(p.last_call_date), "MMM d, yyyy") : "Never",
      p.risk_reason || "",
    ].map(v => `"${String(v).replace(/"/g, '""')}"`));
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "patients.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col h-full">
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-slate-900">Records Hub</h2>
          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-500 text-xs font-semibold">
            {total} Active Patients
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg relative">
            <span className="material-symbols-outlined" style={{fontSize:22}}>notifications</span>
            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
          </button>
          <button
            onClick={() => setAddOpen(true)}
            className="bg-[#1a59d5] text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 hover:bg-[#1548b8] transition-colors"
          >
            <span className="material-symbols-outlined" style={{fontSize:16}}>person_add</span>
            Add New Patient
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-8">
        {/* Search + filters */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" style={{fontSize:20}}>search</span>
              <input
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#1a59d5] text-sm outline-none"
                placeholder="Search by name, phone, or condition..."
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>
            <button
              onClick={() => setFilterOpen(o => !o)}
              className={`px-4 py-2 border rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${filterOpen ? "bg-[#1a59d5] text-white border-[#1a59d5]" : "bg-slate-50 border-slate-200 hover:bg-slate-100"}`}
            >
              <span className="material-symbols-outlined" style={{fontSize:16}}>tune</span>
              Advanced
            </button>
            <button
              onClick={exportCSV}
              className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-slate-100"
            >
              <span className="material-symbols-outlined" style={{fontSize:16}}>download</span>
              Export
            </button>
          </div>

          {/* Advanced filter panel */}
          {filterOpen && (
            <div className="border-t border-slate-100 pt-4 grid grid-cols-4 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Condition</label>
                <input
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#1a59d5]"
                  placeholder="e.g. Type 2"
                  value={filterCondition}
                  onChange={e => setFilterCondition(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">HbA1c Range (%)</label>
                <div className="flex gap-2">
                  <input className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none" placeholder="Min" value={filterHba1cMin} onChange={e => setFilterHba1cMin(e.target.value)} />
                  <input className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none" placeholder="Max" value={filterHba1cMax} onChange={e => setFilterHba1cMax(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Compliance (%)</label>
                <div className="flex gap-2">
                  <input className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none" placeholder="Min" value={filterComplianceMin} onChange={e => setFilterComplianceMin(e.target.value)} />
                  <input className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none" placeholder="Max" value={filterComplianceMax} onChange={e => setFilterComplianceMax(e.target.value)} />
                </div>
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => { setFilterCondition(""); setFilterHba1cMin(""); setFilterHba1cMax(""); setFilterComplianceMin(""); setFilterComplianceMax(""); load(1); }}
                  className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-200"
                >
                  Clear Filters
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Quick Filters:</span>
            <div className="flex gap-2">
              {[
                { key: "all", label: "All" },
                { key: "high", label: "High/Critical" },
                { key: "medium", label: "Medium" },
                { key: "low", label: "Low Risk" },
              ].map(f => (
                <button
                  key={f.key}
                  onClick={() => setSeverityFilter(f.key)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    severityFilter === f.key
                      ? "bg-[#1a59d5]/10 border-[#1a59d5]/30 text-[#1a59d5]"
                      : "bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-3 text-slate-500">
              <span className="text-xs">Sort by:</span>
              {(["created_at", "compliance_score", "name"] as SortKey[]).map(k => (
                <button
                  key={k}
                  onClick={() => toggleSort(k)}
                  className={`text-xs font-bold flex items-center gap-0.5 ${sortKey === k ? "text-[#1a59d5]" : "text-slate-700"}`}
                >
                  {k === "created_at" ? "Last Added" : k === "compliance_score" ? "Compliance" : "Name"}
                  {sortKey === k && (
                    <span className="material-symbols-outlined" style={{fontSize:14}}>
                      {sortAsc ? "arrow_drop_up" : "arrow_drop_down"}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between">
            <span className="text-red-700 text-sm">{error}</span>
            <button onClick={() => load()} className="text-xs font-bold text-red-600 underline">Retry</button>
          </div>
        )}

        {/* Table */}
        <div className="mt-6 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {["Name/ID", "Condition Type", "Recent Vitals", "Compliance Score", "Last AI Outreach", "Actions"].map(h => (
                  <th key={h} className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr><td colSpan={6} className="text-center py-16 text-slate-400 text-sm">Loading patients...</td></tr>
              ) : patients.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-16">
                    <div className="flex flex-col items-center gap-3">
                      <span className="material-symbols-outlined text-slate-300" style={{fontSize:48}}>group</span>
                      <p className="text-slate-400 text-sm">No patients found.</p>
                      <button onClick={() => setAddOpen(true)} className="text-[#1a59d5] text-sm font-bold hover:underline">
                        + Add your first patient
                      </button>
                    </div>
                  </td>
                </tr>
              ) : patients.map((p, i) => {
                const bp = p.vitals?.bp as string || "";
                const { text: bpText, color: bpColor } = bpStatus(bp);
                const avatarColor = AVATAR_COLORS[i % AVATAR_COLORS.length];
                const menuOpen = menuOpenId === p.id;
                return (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors cursor-pointer">
                    <td className="px-6 py-4">
                      <Link href={`/patients/${p.id}`} className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${avatarColor}`}>
                          {p.initials || p.name.slice(0,2).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">{p.name}</p>
                          <p className="text-xs text-slate-500">{p.phone || "—"}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${conditionPill(p.condition)}`}>
                        {conditionShort(p.condition)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm">
                        {bp ? (
                          <>
                            <span className="font-medium">{bp}</span> <span className="text-slate-500 text-xs">mmHg</span>
                            <div className={`text-xs font-medium ${bpColor}`}>{bpText}</div>
                          </>
                        ) : (
                          <span className="text-slate-400">No vitals</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${complianceColor(p.compliance_score)}`} style={{ width: `${p.compliance_score}%` }} />
                        </div>
                        <span className="text-sm font-bold">{p.compliance_score}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {p.last_call_date ? (
                        <div>
                          <p className="font-medium">{format(new Date(p.last_call_date), "MMM d, yyyy")}</p>
                          {p.last_call_sentiment && (
                            <p className={`text-xs ${
                              p.last_call_sentiment === "positive" ? "text-emerald-600" :
                              p.last_call_sentiment === "negative" ? "text-rose-600" : "text-slate-400"
                            }`}>{p.last_call_sentiment}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">Never</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="relative">
                        <button
                          onClick={() => setMenuOpenId(menuOpen ? null : p.id)}
                          className="text-slate-400 hover:text-[#1a59d5] transition-colors"
                        >
                          <span className="material-symbols-outlined" style={{fontSize:22}}>more_vert</span>
                        </button>
                        {menuOpen && (
                          <div className="absolute right-0 top-8 z-20 bg-white border border-slate-200 rounded-xl shadow-lg w-44 py-1" onClick={() => setMenuOpenId(null)}>
                            <Link href={`/patients/${p.id}`} className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                              <span className="material-symbols-outlined" style={{fontSize:16}}>person</span> View Profile
                            </Link>
                            <button onClick={() => setScheduleTarget(p)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                              <span className="material-symbols-outlined" style={{fontSize:16}}>phone</span> Schedule Call
                            </button>
                            <button onClick={exportCSV} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                              <span className="material-symbols-outlined" style={{fontSize:16}}>download</span> Export Record
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pagination */}
          {total > 0 && (
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">
                Showing <span className="text-slate-900">{(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)}</span> of <span className="text-slate-900">{total}</span> patients
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="w-8 h-8 flex items-center justify-center rounded border border-slate-200 text-slate-400 disabled:opacity-40 hover:bg-slate-100"
                >
                  <span className="material-symbols-outlined" style={{fontSize:16}}>chevron_left</span>
                </button>
                {Array.from({ length: Math.min(pages, 5) }, (_, i) => {
                  const pg = i + Math.max(1, page - 2);
                  if (pg > pages) return null;
                  return (
                    <button
                      key={pg}
                      onClick={() => setPage(pg)}
                      className={`w-8 h-8 flex items-center justify-center rounded text-xs font-bold ${pg === page ? "bg-[#1a59d5] text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-100"}`}
                    >
                      {pg}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage(p => Math.min(pages, p + 1))}
                  disabled={page >= pages}
                  className="w-8 h-8 flex items-center justify-center rounded border border-slate-200 text-slate-400 disabled:opacity-40 hover:bg-slate-100"
                >
                  <span className="material-symbols-outlined" style={{fontSize:16}}>chevron_right</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <AddPatientDialog open={addOpen} onClose={() => setAddOpen(false)} onSuccess={() => { load(1); toast.success("Patient added successfully"); }} />
      <CallScheduleModal patient={scheduleTarget} open={!!scheduleTarget} onClose={() => setScheduleTarget(null)} onSuccess={() => { toast.success("Call scheduled"); }} />
    </div>
  );
}

// ─── Multi-step Add Patient Dialog ────────────────────────────────────────────
const AI_FOCUS_OPTIONS = ["Medication adherence", "Blood sugar levels", "Blood pressure", "HbA1c trends", "Diet & lifestyle", "Symptoms", "Insulin dosage", "Weight management"];

function AddPatientDialog({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [step, setStep] = useState(1);
  const TOTAL_STEPS = 4;

  // Step 1: Basic
  const [basic, setBasic] = useState({ name: "", phone: "", condition: "Type 2 Diabetes", severity: "medium", risk_reason: "" });
  // Step 2: Vitals
  const [vitals, setVitals] = useState({ hba1c: "", bp: "", fasting_glucose: "", weight_kg: "" });
  // Step 3: Medications
  const [meds, setMeds] = useState([{ name: "", dose: "", frequency: "Once daily", friendly_name: "" }]);
  // Step 4: Call Protocol + Diet Rules
  const [dietRules, setDietRules] = useState<string[]>([]);
  const [dietInput, setDietInput] = useState("");
  // Step 4: Call Protocol
  const [protocol, setProtocol] = useState({ call_count_per_week: "3", preferred_times: "09:00", ai_focus_areas: [] as string[], custom_instructions: "" });
  // Step 4: Script assignment
  const [scripts, setScripts] = useState<CallScript[]>([]);
  const [assignedScriptId, setAssignedScriptId] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getScripts().then(list => {
      setScripts(list);
      const def = list.find(s => s.is_default);
      if (def) setAssignedScriptId(def.id);
    }).catch(() => {});
  }, []);

  function resetForm() {
    setStep(1);
    setBasic({ name: "", phone: "", condition: "Type 2 Diabetes", severity: "medium", risk_reason: "" });
    setVitals({ hba1c: "", bp: "", fasting_glucose: "", weight_kg: "" });
    setMeds([{ name: "", dose: "", frequency: "Once daily", friendly_name: "" }]);
    setProtocol({ call_count_per_week: "3", preferred_times: "09:00", ai_focus_areas: [], custom_instructions: "" });
    setDietRules([]);
    setDietInput("");
    setAssignedScriptId(scripts.find(s => s.is_default)?.id || "");
    setError("");
  }

  function handleClose() { resetForm(); onClose(); }

  function nextStep() {
    if (step === 1 && !basic.name.trim()) { setError("Name is required"); return; }
    setError("");
    setStep(s => Math.min(TOTAL_STEPS, s + 1));
  }

  function toggleFocus(item: string) {
    setProtocol(p => ({
      ...p,
      ai_focus_areas: p.ai_focus_areas.includes(item)
        ? p.ai_focus_areas.filter(x => x !== item)
        : [...p.ai_focus_areas, item],
    }));
  }

  async function submit() {
    setSaving(true);
    setError("");
    try {
      const words = basic.name.trim().split(" ");
      const initials = words.map(w => w[0]).join("").toUpperCase().slice(0, 2);

      const vitalsObj: Record<string, number | string> = {};
      if (vitals.hba1c) vitalsObj.hba1c = parseFloat(vitals.hba1c);
      if (vitals.bp) vitalsObj.bp = vitals.bp;
      if (vitals.fasting_glucose) vitalsObj.fasting_glucose = parseFloat(vitals.fasting_glucose);
      if (vitals.weight_kg) vitalsObj.weight_kg = parseFloat(vitals.weight_kg);

      const vitalsHistory = Object.keys(vitalsObj).length > 0
        ? [{ date: new Date().toISOString().slice(0, 10), ...vitalsObj }]
        : [];

      const filteredMeds = meds.filter(m => m.name.trim());

      await createPatient({
        ...basic,
        initials,
        severity: basic.severity as any,
        vitals: vitalsObj,
        vitals_history: vitalsHistory,
        medications: filteredMeds,
        diet_rules: dietRules,
        call_script_id: assignedScriptId || undefined,
        call_protocol: {
          call_count_per_week: parseInt(protocol.call_count_per_week),
          preferred_times: [protocol.preferred_times],
          ai_focus_areas: protocol.ai_focus_areas,
          custom_instructions: protocol.custom_instructions,
        },
        compliance_score: 0,
      } as any);
      handleClose();
      onSuccess();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const stepLabels = ["Basic Info", "Vitals", "Medications", "Call Protocol"];

  return (
    <Dialog open={open} onOpenChange={o => !o && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add New Patient</DialogTitle>
          {/* Step indicator */}
          <div className="flex items-center gap-2 mt-3">
            {stepLabels.map((label, i) => (
              <div key={i} className="flex items-center gap-2 flex-1">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  i + 1 < step ? "bg-emerald-500 text-white" :
                  i + 1 === step ? "bg-[#1a59d5] text-white" :
                  "bg-slate-100 text-slate-400"
                }`}>
                  {i + 1 < step ? "✓" : i + 1}
                </div>
                <span className={`text-xs font-medium hidden sm:block ${i + 1 === step ? "text-slate-900" : "text-slate-400"}`}>{label}</span>
                {i < stepLabels.length - 1 && <div className={`flex-1 h-0.5 ${i + 1 < step ? "bg-emerald-500" : "bg-slate-200"}`} />}
              </div>
            ))}
          </div>
        </DialogHeader>

        <div className="space-y-3 py-2 min-h-[200px]">
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          {/* Step 1: Basic Info */}
          {step === 1 && (
            <div className="space-y-3">
              <div className="space-y-1"><Label>Full Name *</Label><Input value={basic.name} onChange={e => setBasic(b => ({ ...b, name: e.target.value }))} placeholder="e.g. Rajan Kumar" /></div>
              <div className="space-y-1"><Label>Phone</Label><Input value={basic.phone} onChange={e => setBasic(b => ({ ...b, phone: e.target.value }))} placeholder="+91 98XXX XXXXX" /></div>
              <div className="space-y-1"><Label>Condition</Label><Input value={basic.condition} onChange={e => setBasic(b => ({ ...b, condition: e.target.value }))} /></div>
              <div className="space-y-1">
                <Label>Risk Level</Label>
                <Select value={basic.severity} onValueChange={v => setBasic(b => ({ ...b, severity: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Risk Reason</Label><Input value={basic.risk_reason} onChange={e => setBasic(b => ({ ...b, risk_reason: e.target.value }))} placeholder="e.g. Uncontrolled HbA1c" /></div>
            </div>
          )}

          {/* Step 2: Vitals */}
          {step === 2 && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">Enter current vitals (optional — can update later)</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>HbA1c (%)</Label><Input type="number" step="0.1" value={vitals.hba1c} onChange={e => setVitals(v => ({ ...v, hba1c: e.target.value }))} placeholder="e.g. 8.5" /></div>
                <div className="space-y-1"><Label>Blood Pressure</Label><Input value={vitals.bp} onChange={e => setVitals(v => ({ ...v, bp: e.target.value }))} placeholder="e.g. 130/85" /></div>
                <div className="space-y-1"><Label>Fasting Glucose (mg/dL)</Label><Input type="number" value={vitals.fasting_glucose} onChange={e => setVitals(v => ({ ...v, fasting_glucose: e.target.value }))} placeholder="e.g. 140" /></div>
                <div className="space-y-1"><Label>Weight (kg)</Label><Input type="number" value={vitals.weight_kg} onChange={e => setVitals(v => ({ ...v, weight_kg: e.target.value }))} placeholder="e.g. 72" /></div>
              </div>
            </div>
          )}

          {/* Step 3: Medications */}
          {step === 3 && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">List current medications the AI should track adherence for</p>
              {meds.map((med, idx) => (
                <div key={idx} className="space-y-1.5 p-3 border border-slate-200 rounded-lg bg-slate-50">
                  <div className="grid grid-cols-7 gap-2 items-end">
                    <div className="col-span-3 space-y-1"><Label className="text-xs">Drug Name</Label><Input value={med.name} onChange={e => { const m = [...meds]; m[idx].name = e.target.value; setMeds(m); }} placeholder="e.g. Metformin" /></div>
                    <div className="col-span-2 space-y-1"><Label className="text-xs">Dose</Label><Input value={med.dose} onChange={e => { const m = [...meds]; m[idx].dose = e.target.value; setMeds(m); }} placeholder="500mg" /></div>
                    <div className="col-span-1 space-y-1"><Label className="text-xs">Freq</Label>
                      <Select value={med.frequency} onValueChange={v => { const m = [...meds]; m[idx].frequency = v; setMeds(m); }}>
                        <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Once daily">1×/day</SelectItem>
                          <SelectItem value="Twice daily">2×/day</SelectItem>
                          <SelectItem value="Three times daily">3×/day</SelectItem>
                          <SelectItem value="Weekly">Weekly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <button onClick={() => setMeds(meds.filter((_, i) => i !== idx))} className="h-9 text-red-400 hover:text-red-600 flex items-center justify-center">
                      <span className="material-symbols-outlined" style={{fontSize:18}}>close</span>
                    </button>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">Patient calls it <span className="text-slate-400">(for AI voice)</span></Label>
                    <Input
                      value={(med as any).friendly_name || ""}
                      onChange={e => { const m = [...meds]; (m[idx] as any).friendly_name = e.target.value; setMeds(m); }}
                      placeholder='e.g. "sugar tablet"'
                      className="text-xs h-8"
                    />
                  </div>
                </div>
              ))}
              <button onClick={() => setMeds([...meds, { name: "", dose: "", frequency: "Once daily", friendly_name: "" }])} className="text-sm text-[#1a59d5] font-bold hover:underline flex items-center gap-1">
                <span className="material-symbols-outlined" style={{fontSize:16}}>add</span> Add Medication
              </button>
            </div>
          )}

          {/* Step 4: Call Protocol */}
          {step === 4 && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500">Configure how the AI agent should interact with this patient</p>
              <div className="space-y-1">
                <Label>Call Script</Label>
                <select
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#1a59d5]"
                  value={assignedScriptId}
                  onChange={e => setAssignedScriptId(e.target.value)}
                >
                  <option value="">Default (use system default)</option>
                  {scripts.map(s => (
                    <option key={s.id} value={s.id}>{s.name}{s.is_default ? " ★" : ""}</option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400">Which call flow script the AI should use for this patient</p>
              </div>
              <div className="space-y-2">
                <Label>Diet Rules (doctor prescribed)</Label>
                <div className="flex flex-wrap gap-1.5 p-2 border border-slate-200 rounded-lg min-h-[36px] bg-slate-50">
                  {dietRules.map(rule => (
                    <span key={rule} className="flex items-center gap-1 px-2 py-0.5 bg-[#1a59d5]/10 text-[#1a59d5] text-xs font-medium rounded-full">
                      {rule}
                      <button onClick={() => setDietRules(r => r.filter(x => x !== rule))} className="hover:text-red-500">
                        <span className="material-symbols-outlined" style={{fontSize:12}}>close</span>
                      </button>
                    </span>
                  ))}
                  <input
                    className="flex-1 min-w-[120px] bg-transparent text-xs outline-none px-1"
                    value={dietInput}
                    onChange={e => setDietInput(e.target.value)}
                    onKeyDown={e => {
                      if ((e.key === "Enter" || e.key === ",") && dietInput.trim()) {
                        e.preventDefault();
                        const rule = dietInput.trim().toLowerCase();
                        if (!dietRules.includes(rule)) setDietRules(r => [...r, rule]);
                        setDietInput("");
                      }
                    }}
                    placeholder='Type a rule, press Enter (e.g. "high fibre")'
                  />
                </div>
                <p className="text-[10px] text-slate-400">Press Enter or comma to add a rule. Examples: high fibre, no alcohol, low sugar</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Calls per week</Label>
                  <Select value={protocol.call_count_per_week} onValueChange={v => setProtocol(p => ({ ...p, call_count_per_week: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["1","2","3","5","7"].map(n => <SelectItem key={n} value={n}>{n}× per week</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Preferred call time</Label>
                  <Input type="time" value={protocol.preferred_times} onChange={e => setProtocol(p => ({ ...p, preferred_times: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>AI should ask about (select all that apply)</Label>
                <div className="flex flex-wrap gap-2">
                  {AI_FOCUS_OPTIONS.map(opt => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => toggleFocus(opt)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        protocol.ai_focus_areas.includes(opt)
                          ? "bg-[#1a59d5] text-white border-[#1a59d5]"
                          : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <Label>Custom AI instructions</Label>
                <Input value={protocol.custom_instructions} onChange={e => setProtocol(p => ({ ...p, custom_instructions: e.target.value }))} placeholder="e.g. Ask about insulin pen usage first" />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {step > 1 && <Button variant="outline" onClick={() => setStep(s => s - 1)}>Back</Button>}
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          {step < TOTAL_STEPS ? (
            <Button onClick={nextStep} className="bg-[#1a59d5] hover:bg-[#1548b8]">Next →</Button>
          ) : (
            <Button onClick={submit} disabled={saving} className="bg-[#1a59d5] hover:bg-[#1548b8]">
              {saving ? "Saving..." : "Add Patient"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
