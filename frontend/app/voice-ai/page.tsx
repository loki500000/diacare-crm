"use client";
import { useEffect, useState } from "react";
import { getPatients, getAllSchedules, updateSchedule, getStats, Patient, CallSchedule, Stats } from "@/lib/api";
import ScriptBuilder from "@/components/ScriptBuilder";
import CallScheduleModal from "@/components/CallScheduleModal";
import SimulateCallModal from "@/components/SimulateCallModal";
import { format, startOfMonth, getDaysInMonth, getDay } from "date-fns";
import { toast } from "sonner";

type Tab = "scheduler" | "script" | "analytics";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function VoiceAIPage() {
  const [tab, setTab] = useState<Tab>("scheduler");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [schedules, setSchedules] = useState<CallSchedule[]>([]);
  const [scheduleTarget, setScheduleTarget] = useState<Patient | null>(null);
  const [simulateTarget, setSimulateTarget] = useState<Patient | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);

  // Calendar state
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(now.getDate());

  // New Schedule picker state
  const [pickOpen, setPickOpen] = useState(false);
  const [pickPatientId, setPickPatientId] = useState("");

  async function load() {
    try {
      const [pRes, sRes, statsRes] = await Promise.all([
        getPatients({ limit: 100 }),
        getAllSchedules(),
        getStats(),
      ]);
      setPatients(pRes.patients);
      setSchedules(sRes);
      setStats(statsRes);
    } catch {
      // Backend offline — page renders with empty state
    }
  }

  useEffect(() => { load(); }, []);

  async function markStatus(scheduleId: string, status: string) {
    await updateSchedule(scheduleId, { status: status as any });
    toast.success(`Marked as ${status}`);
    load();
  }

  function openPickModal() {
    setPickPatientId(patients[0]?.id ?? "");
    setPickOpen(true);
  }

  function confirmPick() {
    const p = patients.find(pt => pt.id === pickPatientId);
    if (p) { setScheduleTarget(p); }
    setPickOpen(false);
  }

  // Build calendar
  const firstDay = getDay(startOfMonth(new Date(calYear, calMonth)));
  const daysInMonth = getDaysInMonth(new Date(calYear, calMonth));
  const calDays: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const scheduledDays = new Set(
    schedules
      .filter(s => {
        const d = new Date(s.scheduled_at);
        return d.getFullYear() === calYear && d.getMonth() === calMonth;
      })
      .map(s => new Date(s.scheduled_at).getDate())
  );

  const selectedDaySchedules = selectedDay ? schedules.filter(s => {
    const d = new Date(s.scheduled_at);
    return d.getFullYear() === calYear && d.getMonth() === calMonth && d.getDate() === selectedDay;
  }) : [];

  function prevMonth() {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
    setSelectedDay(null);
  }
  function nextMonth() {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
    setSelectedDay(null);
  }

  const completedSchedules = schedules.filter(s => s.status === "completed");
  const pickupRate = stats?.pickup_rate ?? (schedules.length > 0 ? Math.round((completedSchedules.length / schedules.length) * 100) : 0);
  const avgDurationMins = stats?.avg_call_duration_secs ? Math.round(stats.avg_call_duration_secs / 60) : 0;
  const callsByDay = stats?.calls_by_day ?? [0,0,0,0,0,0,0];
  const callsByWeek = stats?.calls_by_week ?? [0,0,0,0,0,0];
  const maxDayCount = Math.max(...callsByDay, 1);
  const maxWeekCount = Math.max(...callsByWeek, 1);

  return (
    <div className="flex flex-col h-full">
      <header className="p-8 pb-0">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-3xl font-black text-slate-900 tracking-tight">Outreach &amp; Automation</h2>
            <p className="text-slate-500 mt-1">Manage AI-driven patient engagement and call scheduling</p>
          </div>
          {tab === "scheduler" && (
            <button
              onClick={openPickModal}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#1a59d5] text-white text-sm font-bold rounded-lg hover:bg-[#1548b8] transition-colors shadow-sm"
            >
              <span className="material-symbols-outlined" style={{fontSize:18}}>add</span>
              New Schedule
            </button>
          )}
        </div>
        <div className="flex border-b border-slate-200 mt-6 gap-8">
          {([["scheduler","Call Scheduler"],["script","Script Builder"],["analytics","Engagement Analytics"]] as [Tab,string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`border-b-2 pb-4 font-bold text-sm transition-colors ${
                tab === key ? "border-[#1a59d5] text-[#1a59d5]" : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-8 pt-6">

        {/* ── Engagement Analytics ── */}
        {tab === "analytics" && (
          <div className="space-y-6">
            {/* KPI row */}
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: "Pickup Rate", value: `${pickupRate}%`, icon: "phone_enabled", color: "text-[#1a59d5]" },
                { label: "Avg Duration", value: avgDurationMins > 0 ? `${avgDurationMins}m` : "—", icon: "schedule", color: "text-emerald-600" },
                { label: "Total Calls", value: String(stats?.total_calls ?? 0), icon: "call", color: "text-slate-900" },
                { label: "Scheduled", value: String(schedules.filter(s => s.status === "pending").length), icon: "calendar_month", color: "text-amber-600" },
              ].map(({ label, value, icon, color }) => (
                <div key={label} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`material-symbols-outlined ${color}`} style={{fontSize:20}}>{icon}</span>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</p>
                  </div>
                  <p className={`text-3xl font-black ${color}`}>{value}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-6">
              {/* Calls by day of week */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <h3 className="text-base font-bold mb-1">Call Volume by Day</h3>
                <p className="text-xs text-slate-500 mb-5">Total completed calls per weekday</p>
                <div className="flex items-end gap-2 h-32">
                  {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d, i) => {
                    const count = callsByDay[i] ?? 0;
                    const heightPct = (count / maxDayCount) * 100;
                    return (
                      <div key={d} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-[10px] text-slate-500 font-bold">{count || ""}</span>
                        <div className="w-full rounded-t-md transition-all" style={{ height: `${Math.max(heightPct, 4)}%`, background: count > 0 ? "#1a59d5" : "#e2e8f0" }} />
                        <span className="text-[10px] text-slate-400 font-bold">{d}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Sentiment breakdown */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <h3 className="text-base font-bold mb-1">Sentiment Breakdown</h3>
                <p className="text-xs text-slate-500 mb-5">Patient tone across all calls</p>
                {stats ? (
                  <div className="space-y-3">
                    {([
                      { key: "positive", label: "Positive", color: "bg-emerald-500" },
                      { key: "neutral",  label: "Neutral",  color: "bg-blue-400" },
                      { key: "negative", label: "Negative", color: "bg-rose-500" },
                      { key: "unknown",  label: "Unknown",  color: "bg-slate-300" },
                    ] as { key: string; label: string; color: string }[]).map(({ key, label, color }) => {
                      const sc = stats.sentiment_counts ?? { positive: 0, neutral: 0, negative: 0, unknown: 0 };
                      const count = (sc as Record<string, number>)[key] ?? 0;
                      const total = Object.values(sc).reduce((a, b) => a + b, 0);
                      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                      return (
                        <div key={key} className="flex items-center gap-3">
                          <div className="w-20 text-xs font-bold text-slate-500">{label}</div>
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                          </div>
                          <div className="w-12 text-xs font-bold text-slate-700 text-right">{count} ({pct}%)</div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-slate-400 text-sm">No call data yet.</p>
                )}
              </div>
            </div>

            {/* Weekly call volume trend */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h3 className="text-base font-bold mb-1">Weekly Call Volume (Last 6 Weeks)</h3>
              <p className="text-xs text-slate-500 mb-5">Completed calls per week</p>
              <div className="flex items-end gap-3 h-28">
                {callsByWeek.map((count, i) => {
                  const heightPct = (count / maxWeekCount) * 100;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[10px] text-slate-500 font-bold">{count || ""}</span>
                      <div className="w-full rounded-t-md" style={{ height: `${Math.max(heightPct, 4)}%`, background: i === callsByWeek.length - 1 ? "#1a59d5" : `rgba(26,89,213,${0.3 + i * 0.1})` }} />
                      <span className="text-[10px] text-slate-400 font-bold">{i === callsByWeek.length - 1 ? "Now" : `W-${6 - i}`}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Schedule status breakdown */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h3 className="text-base font-bold mb-4">Schedule Status Breakdown</h3>
              <div className="grid grid-cols-4 gap-4">
                {([
                  { key: "pending",   label: "Pending",   color: "bg-amber-100 text-amber-700 border-amber-200" },
                  { key: "completed", label: "Completed", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
                  { key: "missed",    label: "Missed",    color: "bg-red-100 text-red-700 border-red-200" },
                  { key: "cancelled", label: "Cancelled", color: "bg-slate-100 text-slate-600 border-slate-200" },
                ] as { key: keyof NonNullable<Stats["schedule_counts"]>; label: string; color: string }[]).map(({ key, label, color }) => (
                  <div key={key} className={`rounded-xl border p-4 ${color}`}>
                    <p className="text-xs font-bold uppercase tracking-wider mb-1">{label}</p>
                    <p className="text-2xl font-black">{stats?.schedule_counts?.[key] ?? 0}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Scheduler ── */}
        {tab === "scheduler" && (
          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-8 space-y-6">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                {/* Calendar header */}
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold">Call Calendar</h3>
                  <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg">
                    <button onClick={prevMonth} className="p-1 hover:bg-white rounded-md transition-all shadow-sm">
                      <span className="material-symbols-outlined" style={{fontSize:16}}>chevron_left</span>
                    </button>
                    <span className="text-xs font-bold px-2">
                      {new Date(calYear, calMonth).toLocaleString("default", { month: "long", year: "numeric" })}
                    </span>
                    <button onClick={nextMonth} className="p-1 hover:bg-white rounded-md transition-all shadow-sm">
                      <span className="material-symbols-outlined" style={{fontSize:16}}>chevron_right</span>
                    </button>
                  </div>
                </div>

                {/* Calendar grid */}
                <div className="grid grid-cols-7 gap-1 text-center mb-2">
                  {DAYS.map(d => <div key={d} className="text-[10px] font-bold text-slate-400 uppercase">{d}</div>)}
                  {calDays.map((day, i) => {
                    const isToday = day === now.getDate() && calMonth === now.getMonth() && calYear === now.getFullYear();
                    const isSelected = day === selectedDay;
                    const hasSchedule = day != null && scheduledDays.has(day);
                    return (
                      <div
                        key={i}
                        onClick={() => day && setSelectedDay(day === selectedDay ? null : day)}
                        className={`h-10 flex flex-col items-center justify-center text-sm rounded-lg relative cursor-pointer transition-colors ${
                          !day ? "" :
                          isSelected ? "bg-[#1a59d5] text-white font-bold" :
                          isToday ? "bg-[#1a59d5]/10 text-[#1a59d5] font-bold" :
                          "hover:bg-slate-100 text-slate-700"
                        }`}
                      >
                        {day}
                        {hasSchedule && !isSelected && (
                          <span className="absolute bottom-1 w-1 h-1 rounded-full bg-[#1a59d5] opacity-70" />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Selected day schedules */}
                {selectedDay && (
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-bold text-slate-700">
                        {format(new Date(calYear, calMonth, selectedDay), "MMMM d")} — {selectedDaySchedules.length} schedule(s)
                      </h4>
                      <button
                        onClick={openPickModal}
                        className="text-xs font-bold text-[#1a59d5] flex items-center gap-1 hover:underline"
                      >
                        <span className="material-symbols-outlined" style={{fontSize:14}}>add</span>
                        Schedule for this day
                      </button>
                    </div>
                    {selectedDaySchedules.length === 0 ? (
                      <p className="text-sm text-slate-400">No calls scheduled for this day.</p>
                    ) : selectedDaySchedules.map(s => (
                      <div key={s.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100 mb-2">
                        <div>
                          <p className="text-sm font-bold">{s.patients?.name || "Patient"}</p>
                          <p className="text-xs text-slate-500">{format(new Date(s.scheduled_at), "h:mm a")} · {s.recurrence}</p>
                        </div>
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase ${
                          s.status === "completed" ? "bg-emerald-100 text-emerald-700" :
                          s.status === "missed" ? "bg-red-100 text-red-700" :
                          "bg-amber-100 text-amber-700"
                        }`}>{s.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Upcoming Scheduled Calls */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-base font-bold">Upcoming Scheduled Calls</h4>
                  <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-full">
                    {schedules.filter(s => s.status === "pending").length} pending
                  </span>
                </div>
                <div className="space-y-3">
                  {schedules.filter(s => s.status === "pending").slice(0, 8).map(s => (
                    <div key={s.id} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-xl">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm ${
                          s.patients?.severity === "critical" ? "bg-red-100 text-red-600" :
                          s.patients?.severity === "high" ? "bg-amber-100 text-amber-600" :
                          "bg-blue-100 text-blue-600"
                        }`}>
                          {s.patients?.initials || "?"}
                        </div>
                        <div>
                          <p className="text-sm font-bold">{s.patients?.name || "Patient"}</p>
                          <p className="text-xs text-slate-500">
                            {format(new Date(s.scheduled_at), "MMM d 'at' h:mm a")} · {s.recurrence}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            const p = patients.find(pt => pt.id === s.patient_id);
                            if (p) setSimulateTarget(p);
                          }}
                          className="p-1.5 bg-[#1a59d5] text-white rounded-lg hover:bg-[#1548b8]"
                          title="Call now"
                        >
                          <span className="material-symbols-outlined" style={{fontSize:16}}>phone</span>
                        </button>
                        <button onClick={() => markStatus(s.id, "completed")} className="p-1.5 bg-emerald-100 text-emerald-600 rounded-lg hover:bg-emerald-200" title="Mark done">
                          <span className="material-symbols-outlined" style={{fontSize:16}}>check</span>
                        </button>
                        <button onClick={() => markStatus(s.id, "missed")} className="p-1.5 bg-red-100 text-red-500 rounded-lg hover:bg-red-200" title="Mark missed">
                          <span className="material-symbols-outlined" style={{fontSize:16}}>close</span>
                        </button>
                      </div>
                    </div>
                  ))}
                  {schedules.filter(s => s.status === "pending").length === 0 && (
                    <div className="text-center py-8 border border-dashed border-slate-200 rounded-xl">
                      <span className="material-symbols-outlined text-slate-300 block" style={{fontSize:36}}>calendar_month</span>
                      <p className="text-slate-400 text-sm mt-2">No pending calls.</p>
                      <button onClick={openPickModal} className="mt-3 text-sm font-bold text-[#1a59d5] hover:underline">
                        + Schedule a call
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT: Performance panel */}
            <div className="col-span-4 space-y-6">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-lg font-bold mb-6">Real-time Performance</h3>
                <div className="space-y-6">
                  <div>
                    <div className="flex justify-between items-end mb-2">
                      <p className="text-xs font-medium text-slate-500 uppercase">Pickup Rate</p>
                      <p className="text-2xl font-black text-[#1a59d5]">{pickupRate}%</p>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-[#1a59d5] rounded-full transition-all" style={{width:`${pickupRate}%`}} />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2">{completedSchedules.length} of {schedules.length} calls completed</p>
                  </div>

                  <div>
                    <div className="flex justify-between items-end mb-2">
                      <p className="text-xs font-medium text-slate-500 uppercase">Avg. Conv. Length</p>
                      <p className="text-2xl font-black text-slate-900">{avgDurationMins > 0 ? `${avgDurationMins}m` : "—"}</p>
                    </div>
                    <div className="flex items-end gap-1 h-20 px-2">
                      {callsByDay.map((h, i) => (
                        <div key={i} className="flex-1 rounded-t" style={{height:`${Math.max((h / maxDayCount) * 100, 4)}%`, background:`rgba(26,89,213,${0.2 + i * 0.1})`}} />
                      ))}
                    </div>
                    <div className="flex justify-between mt-2 px-1 text-[8px] text-slate-400 uppercase font-bold">
                      {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => <span key={d}>{d}</span>)}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100">
                    <h4 className="text-xs font-bold text-slate-400 uppercase mb-3">Live Outreach Feed</h4>
                    <div className="space-y-3">
                      {schedules.slice(0, 4).map(s => (
                        <div key={s.id} className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            s.status === "completed" ? "bg-green-500" :
                            s.status === "pending" ? "bg-amber-500" :
                            s.status === "missed" ? "bg-red-400" : "bg-slate-300"
                          }`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold truncate capitalize">{s.status}</p>
                            <p className="text-[10px] text-slate-500 truncate">{s.patients?.name || "—"}</p>
                          </div>
                          <span className="text-[10px] text-slate-400 flex-shrink-0">
                            {format(new Date(s.scheduled_at), "MMM d")}
                          </span>
                        </div>
                      ))}
                      {schedules.length === 0 && (
                        <p className="text-xs text-slate-400">No recent activity.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Script Builder ── */}
        {tab === "script" && <ScriptBuilder />}
      </div>

      {/* Patient Picker Modal */}
      {pickOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setPickOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-lg font-bold mb-1">Schedule a Call</h3>
            <p className="text-sm text-slate-500 mb-4">Choose a patient to schedule a call for.</p>
            {patients.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">No patients found. Add patients first.</p>
            ) : (
              <select
                value={pickPatientId}
                onChange={e => setPickPatientId(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[#1a59d5] bg-slate-50 mb-4"
              >
                {patients.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.condition} ({p.severity})
                  </option>
                ))}
              </select>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setPickOpen(false)} className="px-4 py-2 text-sm font-bold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
                Cancel
              </button>
              <button
                onClick={confirmPick}
                disabled={!pickPatientId}
                className="px-4 py-2 text-sm font-bold bg-[#1a59d5] text-white rounded-lg hover:bg-[#1548b8] disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      )}

      <CallScheduleModal patient={scheduleTarget} open={!!scheduleTarget} onClose={() => setScheduleTarget(null)} onSuccess={() => { toast.success("Call scheduled"); load(); }} />
      <SimulateCallModal patient={simulateTarget} open={!!simulateTarget} onClose={() => setSimulateTarget(null)} onCallEnd={load} />
    </div>
  );
}
