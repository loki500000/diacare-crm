"use client";
import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Invalid credentials");
        return;
      }
      // Store display info in localStorage for sidebar / UI
      localStorage.setItem("dia_session", JSON.stringify({
        role: data.role,
        clinic_name: data.clinic_name || "DiaCare CRM",
        doctor_name: data.doctor_name || "",
      }));
      router.replace("/triage");
    } catch {
      setError("Cannot reach backend. Is the server running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-[#0f2d6b] to-slate-900 flex items-center justify-center p-4">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-10 pointer-events-none"
        style={{backgroundImage: "radial-gradient(circle at 25% 35%, #1a59d5 0%, transparent 50%), radial-gradient(circle at 75% 65%, #1a59d5 0%, transparent 50%)"}}
      />

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#1a59d5] shadow-lg shadow-[#1a59d5]/30 mb-4">
            <span className="material-symbols-outlined text-white" style={{fontSize:32}}>medical_services</span>
          </div>
          <h1 className="text-2xl font-black text-white">DiaCare CRM</h1>
          <p className="text-slate-400 text-sm mt-1">Secure patient management system</p>
        </div>

        {/* Card */}
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 shadow-2xl p-8">
          <h2 className="text-lg font-bold text-white mb-1">Sign in</h2>
          <p className="text-slate-400 text-sm mb-6">Enter your credentials to access the dashboard</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Username
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" style={{fontSize:18}}>person</span>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Enter username"
                  required
                  autoFocus
                  className="w-full bg-white/10 border border-white/20 rounded-xl pl-10 pr-4 py-3 text-white placeholder-slate-500 text-sm outline-none focus:ring-2 focus:ring-[#1a59d5] focus:border-[#1a59d5] transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" style={{fontSize:18}}>lock</span>
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter password"
                  required
                  className="w-full bg-white/10 border border-white/20 rounded-xl pl-10 pr-11 py-3 text-white placeholder-slate-500 text-sm outline-none focus:ring-2 focus:ring-[#1a59d5] focus:border-[#1a59d5] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                >
                  <span className="material-symbols-outlined" style={{fontSize:18}}>
                    {showPass ? "visibility_off" : "visibility"}
                  </span>
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-300 text-sm">
                <span className="material-symbols-outlined flex-shrink-0" style={{fontSize:16}}>error</span>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full py-3 bg-[#1a59d5] hover:bg-[#1548b8] text-white font-bold rounded-xl transition-all shadow-lg shadow-[#1a59d5]/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined animate-spin" style={{fontSize:18}}>progress_activity</span>
                  Signing in...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined" style={{fontSize:18}}>login</span>
                  Sign In
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-slate-600 text-xs mt-6">
          Contact your system administrator to reset access.
        </p>
      </div>
    </div>
  );
}
