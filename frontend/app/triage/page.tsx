"use client";
import { useEffect, useState } from "react";
import { getPatients, snoozePatient, Patient } from "@/lib/api";
import CallScheduleModal from "@/components/CallScheduleModal";
import Link from "next/link";
import { format } from "date-fns";
import { toast } from "sonner";

type Period = "daily" | "weekly" | "monthly";

export default function TriagePage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [scheduleTarget, setScheduleTarget] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [period, setPeriod] = useState<Period>("daily");
  const LIMIT = 10;

  async function load(p = page) {
    setLoading(true);
    setError("");
    try {
      const res = await getPatients({
        search: search || undefined,
        severity: severityFilter !== "all" ? severityFilter : undefined,
        page: p,
        limit: LIMIT,
      });
      setPatients(res.patients);
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
  }, [search, severityFilter]);

  useEffect(() => { load(page); }, [page]);

  async function handleSnooze(patient: Patient) {
    try {
      const res = await snoozePatient(patient.id);
      toast.success(`Snoozed ${res.snoozed_count} schedule(s) by 1 day for ${patient.name}`);
      load(page);
    } catch {
      toast.error("Failed to snooze patient");
    }
  }

  function exportCSV() {
    const headers = ["Name", "Phone", "Severity", "Risk Reason", "Last Call", "HbA1c"];
    const rows = patients.map(p => [
      p.name, p.phone || "", p.severity, p.risk_reason || "",
      p.last_call_date ? format(new Date(p.last_call_date), "MMM d, yyyy") : "Never",
      p.vitals?.hba1c ?? "",
    ].map(v => `"${String(v).replace(/"/g, '""')}"`));
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "triage-queue.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const allPatients = patients;
  const critical = allPatients.filter(p => p.severity === "critical");
  const warning  = allPatients.filter(p => p.severity === "high");
  const stable   = allPatients.filter(p => p.severity === "medium" || p.severity === "low");

  const periodLabel = period === "daily" ? "today" : period === "weekly" ? "this week" : "this month";

  return (
    <div className="flex flex-col h-full">
      <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-slate-900">Patient Triage</h2>
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 text-xs">
            {(["daily","weekly","monthly"] as Period[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)} className={`px-3 py-1 rounded-md font-medium capitalize transition-colors ${period === p ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"}`}>{p}</button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative w-72">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" style={{fontSize:18}}>search</span>
            <input
              className="w-full pl-10 pr-4 py-2 bg-slate-100 border-none rounded-lg text-sm focus:ring-2 focus:ring-[#1a59d5] outline-none"
              placeholder="Search by patient ID or name..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg relative">
            <span className="material-symbols-outlined" style={{fontSize:22}}>notifications</span>
            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-8 space-y-6">
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between">
            <span className="text-red-700 text-sm">{error}</span>
            <button onClick={() => load()} className="text-xs font-bold text-red-600 underline">Retry</button>
          </div>
        )}

        {/* Risk Cards */}
        <section className="grid grid-cols-3 gap-6">
          <RiskCard
            label="Critical"
            count={critical.length}
            total={total}
            borderColor="border-red-500"
            bgIcon="bg-red-50"
            iconColor="text-red-500"
            icon="emergency"
            trendColor="text-red-500"
            period={periodLabel}
          />
          <RiskCard
            label="Warning"
            count={warning.length}
            total={total}
            borderColor="border-amber-500"
            bgIcon="bg-amber-50"
            iconColor="text-amber-500"
            icon="warning"
            trendColor="text-amber-500"
            period={periodLabel}
          />
          <RiskCard
            label="Stable"
            count={stable.length}
            total={total}
            borderColor="border-emerald-500"
            bgIcon="bg-emerald-50"
            iconColor="text-emerald-500"
            icon="check_circle"
            trendColor="text-emerald-500"
            period={periodLabel}
          />
        </section>

        {/* Queue Management */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
            <h3 className="font-bold text-slate-900">Queue Management</h3>
            <div className="flex gap-2">
              {/* Severity filter */}
              <select
                value={severityFilter}
                onChange={e => setSeverityFilter(e.target.value)}
                className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#1a59d5]"
              >
                <option value="all">All Severities</option>
                <option value="critical">Critical Only</option>
                <option value="high">High Only</option>
                <option value="medium">Medium Only</option>
                <option value="low">Low Only</option>
              </select>
              <button onClick={exportCSV} className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1">
                <span className="material-symbols-outlined" style={{fontSize:14}}>download</span> Export
              </button>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-16 text-slate-400 text-sm">Loading...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs font-bold uppercase tracking-wider">
                    <th className="px-6 py-4">Patient Name</th>
                    <th className="px-6 py-4 text-center">Severity</th>
                    <th className="px-6 py-4">Risk Reason</th>
                    <th className="px-6 py-4">Last AI Call Result</th>
                    <th className="px-6 py-4 text-right">Quick Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {patients.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-12">
                        <div className="flex flex-col items-center gap-3">
                          <span className="material-symbols-outlined text-slate-300" style={{fontSize:48}}>emergency</span>
                          <p className="text-slate-400 text-sm">No patients in triage.</p>
                          <Link href="/patients" className="text-[#1a59d5] text-sm font-bold hover:underline">Add patients →</Link>
                        </div>
                      </td>
                    </tr>
                  ) : patients.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <Link href={`/patients/${p.id}`} className="flex items-center gap-3 hover:text-[#1a59d5]">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                            p.severity === "critical" ? "bg-red-100 text-red-600" :
                            p.severity === "high"     ? "bg-amber-100 text-amber-600" :
                            p.severity === "medium"   ? "bg-blue-100 text-blue-600" :
                                                        "bg-emerald-100 text-emerald-600"
                          }`}>
                            {p.initials || p.name.slice(0,2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 text-sm">{p.name}</p>
                            <p className="text-xs text-slate-500">{p.phone || "No phone"}</p>
                          </div>
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <SeverityPill severity={p.severity} />
                      </td>
                      <td className="px-6 py-4">
                        {p.risk_reason ? (
                          <div>
                            <span className={`text-sm font-medium ${p.severity === "critical" ? "text-red-600" : p.severity === "high" ? "text-amber-600" : "text-slate-700"}`}>
                              {p.risk_reason.slice(0, 40)}{p.risk_reason.length > 40 ? "..." : ""}
                            </span>
                            <div className="text-xs text-slate-400 italic">HbA1c: {p.vitals?.hba1c ?? "—"}%</div>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-sm">Normal range</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {p.last_call_date ? (
                          <div className="text-sm">
                            <div className="flex items-center gap-1 text-slate-600">
                              <span className="material-symbols-outlined text-slate-400" style={{fontSize:16}}>call</span>
                              <span className={`text-xs font-medium ${
                                p.last_call_sentiment === "positive" ? "text-emerald-600" :
                                p.last_call_sentiment === "negative" ? "text-rose-600" : "text-slate-500"
                              }`}>{p.last_call_sentiment || "completed"}</span>
                            </div>
                            {p.last_call_summary && (
                              <p className="text-xs text-slate-500 mt-0.5 max-w-[200px] truncate">{p.last_call_summary}</p>
                            )}
                            <p className="text-[10px] text-slate-400">{format(new Date(p.last_call_date), "MMM d")}</p>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-sm text-slate-400">
                            <span className="material-symbols-outlined" style={{fontSize:16}}>call</span>
                            No calls yet
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setScheduleTarget(p)}
                            className="p-2 bg-[#1a59d5] text-white rounded-lg hover:bg-[#1548b8] transition-colors"
                            title="Schedule Call"
                          >
                            <span className="material-symbols-outlined" style={{fontSize:16}}>phone</span>
                          </button>
                          <button
                            onClick={() => handleSnooze(p)}
                            className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-amber-100 hover:text-amber-600 transition-colors"
                            title="Snooze — delay next call by 1 day"
                          >
                            <span className="material-symbols-outlined" style={{fontSize:16}}>snooze</span>
                          </button>
                          <Link href={`/patients/${p.id}`}>
                            <button className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-[#1a59d5]/10 hover:text-[#1a59d5] transition-colors" title="View profile">
                              <span className="material-symbols-outlined" style={{fontSize:16}}>person</span>
                            </button>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {total > 0 && (
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <p className="text-xs text-slate-500 font-medium">
                Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total} patients
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="w-8 h-8 flex items-center justify-center rounded border border-slate-200 text-slate-400 disabled:opacity-40 hover:bg-slate-100">
                  <span className="material-symbols-outlined" style={{fontSize:16}}>chevron_left</span>
                </button>
                {Array.from({ length: Math.min(pages, 5) }, (_, i) => {
                  const pg = i + Math.max(1, page - 2);
                  if (pg > pages) return null;
                  return (
                    <button key={pg} onClick={() => setPage(pg)} className={`w-8 h-8 flex items-center justify-center rounded text-xs font-bold ${pg === page ? "bg-[#1a59d5] text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-100"}`}>{pg}</button>
                  );
                })}
                <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page >= pages} className="w-8 h-8 flex items-center justify-center rounded border border-slate-200 text-slate-400 disabled:opacity-40 hover:bg-slate-100">
                  <span className="material-symbols-outlined" style={{fontSize:16}}>chevron_right</span>
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      <CallScheduleModal
        patient={scheduleTarget}
        open={!!scheduleTarget}
        onClose={() => setScheduleTarget(null)}
        onSuccess={() => { toast.success("Call scheduled"); load(page); }}
      />
    </div>
  );
}

function RiskCard({ label, count, total, borderColor, bgIcon, iconColor, icon, trendColor, period }: {
  label: string; count: number; total: number; borderColor: string; bgIcon: string;
  iconColor: string; icon: string; trendColor: string; period: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className={`bg-white p-6 rounded-xl border-l-4 ${borderColor} shadow-sm border border-slate-200`}>
      <div className="flex justify-between items-start">
        <div>
          <p className="text-slate-500 text-sm font-semibold uppercase tracking-wider">{label}</p>
          <h3 className="text-4xl font-bold text-slate-900 mt-1">{count}</h3>
        </div>
        <div className={`${bgIcon} p-2 rounded-lg`}>
          <span className={`material-symbols-outlined ${iconColor}`} style={{fontSize:22}}>{icon}</span>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <span className={`font-bold text-sm ${trendColor}`}>{pct}%</span>
        <span className="text-slate-400 text-sm">of total — {period}</span>
      </div>
    </div>
  );
}

function SeverityPill({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    critical: "bg-red-100 text-red-600",
    high:     "bg-amber-100 text-amber-600",
    medium:   "bg-blue-100 text-blue-600",
    low:      "bg-emerald-100 text-emerald-600",
  };
  const label: Record<string, string> = {
    critical: "CRITICAL", high: "WARNING", medium: "MEDIUM", low: "STABLE",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${map[severity] ?? map.medium}`}>
      {label[severity] ?? severity.toUpperCase()}
    </span>
  );
}
