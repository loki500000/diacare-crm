"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const nav = [
  { href: "/triage",    icon: "shutter_speed",    label: "Triage" },
  { href: "/patients",  icon: "group",             label: "Patients" },
  { href: "/voice-ai",  icon: "settings_voice",    label: "Voice AI" },
  { href: "/analytics", icon: "bar_chart",         label: "Analytics" },
];

interface Session {
  role: "superadmin" | "doctor";
  clinic_name: string;
  doctor_name: string;
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("dia_session");
      if (raw) setSession(JSON.parse(raw));
    } catch { }
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    localStorage.removeItem("dia_session");
    router.replace("/login");
  }

  const displayName = session?.doctor_name || session?.clinic_name || "DiaCare CRM";
  const isSuperAdmin = session?.role === "superadmin";

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col flex-shrink-0 h-screen">
      {/* Logo */}
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className="bg-[#1a59d5] p-1.5 rounded-lg">
            <span className="material-symbols-outlined text-white" style={{fontSize:22}}>medical_services</span>
          </div>
          <div>
            <h1 className="text-slate-900 text-lg font-bold leading-none truncate max-w-[140px]">
              {session?.clinic_name || "DiaCare CRM"}
            </h1>
            <p className="text-slate-500 text-xs font-medium mt-0.5">Command Center</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-4 py-6 space-y-1">
        {nav.map(({ href, icon, label }) => {
          const active = pathname === href || (href !== "/triage" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                active
                  ? "bg-[#1a59d5]/10 text-[#1a59d5]"
                  : "text-slate-600 hover:bg-slate-100 font-medium"
              }`}
            >
              <span className="material-symbols-outlined" style={{fontSize:22}}>{icon}</span>
              {label}
            </Link>
          );
        })}

        {/* Settings — super admin only */}
        {isSuperAdmin && (
          <div className="pt-4 mt-4 border-t border-slate-200">
            <Link
              href="/settings"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                pathname === "/settings"
                  ? "bg-[#1a59d5]/10 text-[#1a59d5] font-semibold"
                  : "text-slate-600 hover:bg-slate-100 font-medium"
              }`}
            >
              <span className="material-symbols-outlined" style={{fontSize:22}}>settings</span>
              Settings
              <span className="ml-auto text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                Admin
              </span>
            </Link>
          </div>
        )}
      </nav>

      {/* User footer */}
      <div className="p-4 border-t border-slate-200">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
            isSuperAdmin ? "bg-amber-100 text-amber-700" : "bg-[#1a59d5]/10 text-[#1a59d5]"
          }`}>
            {isSuperAdmin
              ? <span className="material-symbols-outlined" style={{fontSize:16}}>shield_person</span>
              : <span className="material-symbols-outlined" style={{fontSize:16}}>stethoscope</span>
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">{displayName}</p>
            <p className={`text-xs truncate font-medium ${isSuperAdmin ? "text-amber-600" : "text-slate-500"}`}>
              {isSuperAdmin ? "Super Admin" : "Doctor"}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
            title="Sign out"
          >
            <span className="material-symbols-outlined" style={{fontSize:18}}>logout</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
