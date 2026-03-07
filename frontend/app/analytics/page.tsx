"use client";
import { useEffect, useState } from "react";
import { getStats, getPatients, Stats, Patient } from "@/lib/api";
import { format } from "date-fns";

type Tab = "overview" | "adherence" | "outcomes" | "export";

function escapeCSV(val: string | number) {
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export default function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<Stats | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [s, p] = await Promise.all([getStats(), getPatients({ limit: 200 })]);
      setStats(s);
      setPatients(p.patients);
    } catch {
      setError("Could not reach backend. Is the server running on port 8001?");
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  const avgCompliance = stats?.avg_compliance ?? (
    patients.length ? Math.round(patients.reduce((a, p) => a + p.compliance_score, 0) / patients.length) : 0
  );
  const totalCallMins = Math.round((stats?.total_call_duration_secs ?? 0) / 60);

  // Build adherence chart from patient data — sort by compliance
  const sorted = [...patients].sort((a, b) => b.compliance_score - a.compliance_score);

  // Export functions
  function exportComplianceCSV() {
    const headers = ["Name", "Phone", "Condition", "Severity", "HbA1c", "Compliance %", "BP", "Risk Reason"];
    const rows = patients.map(p => [
      p.name, p.phone, p.condition, p.severity,
      p.vitals?.hba1c ?? "", p.compliance_score,
      p.vitals?.bp ?? "", p.risk_reason ?? "",
    ].map(escapeCSV));
    downloadCSV([headers, ...rows], "patient-compliance-report.csv");
  }

  function exportCallEngagementCSV() {
    const headers = ["Name", "Phone", "Last Call Date", "Last Call Sentiment", "Last Call Summary"];
    const rows = patients.map(p => [
      p.name, p.phone || "",
      p.last_call_date ? format(new Date(p.last_call_date), "MMM d, yyyy") : "Never",
      p.last_call_sentiment || "",
      p.last_call_summary || "",
    ].map(escapeCSV));
    downloadCSV([headers, ...rows], "call-engagement-summary.csv");
  }

  function exportSeverityCSV() {
    const headers = ["Name", "Severity", "Risk Reason", "HbA1c", "Condition", "Compliance %"];
    const rows = patients.map(p => [
      p.name, p.severity, p.risk_reason || "",
      p.vitals?.hba1c ?? "", p.condition, p.compliance_score,
    ].map(escapeCSV));
    downloadCSV([headers, ...rows], "severity-risk-analysis.csv");
  }

  function downloadCSV(rows: string[][], filename: string) {
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div className="p-8 text-slate-400">Loading analytics...</div>;
  if (error) return (
    <div className="p-8">
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-start gap-4">
        <span className="material-symbols-outlined text-red-500 mt-0.5">wifi_off</span>
        <div>
          <p className="font-bold text-red-700">Backend Offline</p>
          <p className="text-sm text-red-600 mt-1">{error}</p>
          <p className="text-xs text-red-500 mt-2 font-mono">cd crm-backend &amp;&amp; python main.py</p>
          <button onClick={load} className="mt-3 text-sm font-bold text-red-700 underline">Retry</button>
        </div>
      </div>
    </div>
  );

  // Build SVG path for adherence trend from calls_by_week
  const weekData = stats?.calls_by_week ?? [0,0,0,0,0,0];
  const maxW = Math.max(...weekData, 1);
  const svgCoords = weekData.map((v, i) => {
    const x = (i / Math.max(weekData.length - 1, 1)) * 500;
    const y = 140 - (v / maxW) * 120;
    return { x, y };
  });
  const svgLinePath = svgCoords.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const svgAreaPath = `${svgLinePath} L500,150 L0,150 Z`;

  return (
    <div className="flex flex-col h-full">
      <div className="p-8 pb-0">
        <h1 className="text-4xl font-black text-slate-900 tracking-tight">Insights &amp; Reports</h1>
        <p className="text-slate-500 text-lg mt-1">Monitoring population adherence and health outcomes.</p>
        <div className="flex border-b border-slate-200 mt-6 gap-8">
          {([
            ["overview","Overview"],
            ["adherence","Adherence Trends"],
            ["outcomes","Outcome Tracking"],
            ["export","Export Center"],
          ] as [Tab,string][]).map(([key,label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`border-b-2 pb-3 font-bold text-sm transition-colors ${
                tab === key ? "border-[#1a59d5] text-[#1a59d5]" : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        {/* ── OVERVIEW ── */}
        {tab === "overview" && (
          <>
            <div className="grid grid-cols-2 gap-6 mb-8">
              {/* Call volume trend */}
              <section className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Call Volume Trend</h2>
                    <p className="text-sm text-slate-500">Completed calls — last 6 weeks</p>
                  </div>
                  <div className="text-right">
                    <span className="text-3xl font-bold text-[#1a59d5]">{stats?.total_calls ?? 0}</span>
                    <div className="text-xs text-slate-500 font-medium">total calls</div>
                  </div>
                </div>
                <div className="h-48 relative">
                  <svg className="w-full h-full" viewBox="0 0 500 150" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="gradCalls" x1="0%" x2="0%" y1="0%" y2="100%">
                        <stop offset="0%" stopColor="#1a59d5" stopOpacity="0.2"/>
                        <stop offset="100%" stopColor="#1a59d5" stopOpacity="0"/>
                      </linearGradient>
                    </defs>
                    {weekData.length >= 2 && (
                      <>
                        <path d={svgAreaPath} fill="url(#gradCalls)" stroke="none"/>
                        <path d={svgLinePath} fill="none" stroke="#1a59d5" strokeLinecap="round" strokeWidth="3"/>
                      </>
                    )}
                    {weekData.every(v => v === 0) && (
                      <text x="250" y="75" textAnchor="middle" fill="#94a3b8" fontSize="14">No call data yet</text>
                    )}
                  </svg>
                  <div className="absolute bottom-0 left-0 right-0 flex justify-between text-[10px] font-bold text-slate-400 px-2">
                    {weekData.map((_, i) => <span key={i}>{i === weekData.length - 1 ? "NOW" : `W-${weekData.length - 1 - i}`}</span>)}
                  </div>
                </div>
              </section>

              {/* Outcome summary */}
              <section className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Outcome Summary</h2>
                    <p className="text-sm text-slate-500">AI Check-ins vs Population Health</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="p-4 bg-[#f6f6f8] rounded-lg border border-slate-100">
                    <p className="text-xs font-bold text-slate-500 uppercase">AI Check-ins</p>
                    <p className="text-2xl font-black text-slate-900">{stats?.total_calls ?? 0}</p>
                    <p className="text-xs text-[#1a59d5] font-medium mt-1">Total calls logged</p>
                  </div>
                  <div className="p-4 bg-[#f6f6f8] rounded-lg border border-slate-100">
                    <p className="text-xs font-bold text-slate-500 uppercase">Call Minutes</p>
                    <p className="text-2xl font-black text-emerald-600">{totalCallMins}</p>
                    <p className="text-xs text-slate-500 font-medium mt-1">Total duration</p>
                  </div>
                </div>
                <div className="space-y-4">
                  {[
                    { label: "Avg Compliance", pct: avgCompliance },
                    { label: "Pickup Rate",    pct: stats?.pickup_rate ?? 0 },
                  ].map(({ label, pct }) => (
                    <div key={label} className="flex items-center gap-4">
                      <div className="w-28 text-xs font-bold text-slate-500">{label}</div>
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="bg-[#1a59d5] h-full rounded-full" style={{width:`${pct}%`}} />
                      </div>
                      <div className="w-10 text-xs font-bold text-slate-900">{pct}%</div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* Severity breakdown */}
            <div className="grid grid-cols-4 gap-4 mb-8">
              {(["critical","high","medium","low"] as const).map(sev => {
                const count = stats?.severity_counts[sev] ?? 0;
                const colors: Record<string, string> = {
                  critical: "border-red-500 bg-red-50 text-red-700",
                  high:     "border-amber-500 bg-amber-50 text-amber-700",
                  medium:   "border-blue-500 bg-blue-50 text-blue-700",
                  low:      "border-emerald-500 bg-emerald-50 text-emerald-700",
                };
                return (
                  <div key={sev} className={`bg-white rounded-xl border-l-4 p-4 shadow-sm border ${colors[sev]}`}>
                    <p className="text-xs font-bold uppercase tracking-wide">{sev}</p>
                    <p className="text-3xl font-bold mt-1">{count}</p>
                    <p className="text-xs mt-0.5 opacity-70">patients</p>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── ADHERENCE TRENDS ── */}
        {tab === "adherence" && (
          <div className="space-y-6">
            <section className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Patient Compliance Ranking</h2>
                  <p className="text-sm text-slate-500">All patients sorted by compliance score</p>
                </div>
                <span className="text-3xl font-bold text-[#1a59d5]">{avgCompliance}%<span className="text-sm font-normal text-slate-400 ml-1">avg</span></span>
              </div>
              {patients.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-8">No patient data yet.</p>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {sorted.map((p, i) => (
                    <div key={p.id} className="flex items-center gap-4">
                      <span className="w-6 text-xs font-bold text-slate-400 text-right">{i + 1}</span>
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-[#1a59d5]/10 text-[#1a59d5]">
                        {p.initials || p.name.slice(0,2).toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-sm font-bold text-slate-900">{p.name}</span>
                          <span className="text-xs font-bold text-slate-900">{p.compliance_score}%</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${p.compliance_score >= 80 ? "bg-[#1a59d5]" : p.compliance_score >= 60 ? "bg-amber-500" : "bg-rose-500"}`} style={{width:`${p.compliance_score}%`}} />
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                        p.severity === "critical" ? "bg-red-100 text-red-700" :
                        p.severity === "high" ? "bg-amber-100 text-amber-700" :
                        p.severity === "medium" ? "bg-blue-100 text-blue-700" :
                        "bg-emerald-100 text-emerald-700"
                      }`}>{p.severity.toUpperCase()}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ── OUTCOME TRACKING ── */}
        {tab === "outcomes" && (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Total Calls", value: stats?.total_calls ?? 0, color: "text-slate-900", bg: "bg-slate-50" },
                { label: "Completed", value: stats?.schedule_counts.completed ?? 0, color: "text-emerald-700", bg: "bg-emerald-50" },
                { label: "Missed", value: stats?.schedule_counts.missed ?? 0, color: "text-red-700", bg: "bg-red-50" },
              ].map(({ label, value, color, bg }) => (
                <div key={label} className={`${bg} rounded-xl border border-slate-200 p-6`}>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{label}</p>
                  <p className={`text-4xl font-black ${color}`}>{value}</p>
                </div>
              ))}
            </div>

            <section className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
              <h2 className="text-xl font-bold mb-4">Sentiment Distribution</h2>
              {stats ? (
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-4">
                    {([
                      { key: "positive" as const, label: "Positive", color: "bg-emerald-500", text: "text-emerald-700" },
                      { key: "neutral"  as const, label: "Neutral",  color: "bg-blue-400",   text: "text-blue-700" },
                      { key: "negative" as const, label: "Negative", color: "bg-rose-500",   text: "text-rose-700" },
                    ]).map(({ key, label, color, text }) => {
                      const sc = stats.sentiment_counts ?? { positive: 0, neutral: 0, negative: 0, unknown: 0 };
                      const count = sc[key] ?? 0;
                      const total = Object.values(sc).reduce((a, b) => a + b, 0);
                      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                      return (
                        <div key={key}>
                          <div className="flex justify-between mb-1">
                            <span className={`text-sm font-bold ${text}`}>{label}</span>
                            <span className="text-sm font-bold text-slate-700">{count} ({pct}%)</span>
                          </div>
                          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${color}`} style={{width:`${pct}%`}} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex flex-col justify-center">
                    <p className="text-sm text-slate-500 mb-2">Call Duration</p>
                    <p className="text-5xl font-black text-slate-900">{totalCallMins}<span className="text-lg font-normal text-slate-400 ml-1">min</span></p>
                    <p className="text-xs text-slate-400 mt-2">total across all calls</p>
                    {(stats.avg_call_duration_secs ?? 0) > 0 && (
                      <p className="text-sm text-[#1a59d5] font-bold mt-3">
                        avg {Math.round(stats.avg_call_duration_secs / 60)}m per call
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-slate-400 text-sm">No call data yet.</p>
              )}
            </section>
          </div>
        )}

        {/* ── EXPORT CENTER ── */}
        {tab === "export" && (
          <section className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Export Center</h2>
                <p className="text-sm text-slate-500">Download patient data and engagement reports as CSV</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs font-bold uppercase tracking-wider">
                    <th className="px-6 py-4">Report Name</th>
                    <th className="px-6 py-4">Category</th>
                    <th className="px-6 py-4">Records</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[
                    {
                      name: "Patient_Compliance_Report.csv",
                      category: "Population Health",
                      count: patients.length,
                      onDownload: exportComplianceCSV,
                    },
                    {
                      name: "Call_Engagement_Summary.csv",
                      category: "Voice AI",
                      count: patients.filter(p => p.last_call_date).length,
                      onDownload: exportCallEngagementCSV,
                    },
                    {
                      name: "Severity_Risk_Analysis.csv",
                      category: "Triage",
                      count: patients.length,
                      onDownload: exportSeverityCSV,
                    },
                  ].map(row => (
                    <tr key={row.name} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded bg-red-100 text-red-600">
                            <span className="material-symbols-outlined" style={{fontSize:18}}>description</span>
                          </div>
                          <span className="font-semibold text-sm text-slate-900">{row.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{row.category}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{row.count} rows</td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 rounded-md text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700">Ready</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={row.onDownload}
                          className="font-bold text-sm inline-flex items-center gap-1 text-[#1a59d5] hover:text-[#1548b8]"
                        >
                          <span className="material-symbols-outlined" style={{fontSize:18}}>download</span>
                          Download
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-6 bg-slate-50 flex items-center justify-between text-xs font-medium text-slate-500">
              <p>Showing 3 reports · {patients.length} patient records loaded</p>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
