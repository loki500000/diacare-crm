"use client";
import { useEffect, useState } from "react";
import { getSettings, saveSettings } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, Loader2, ShieldCheck } from "lucide-react";

const ASTERISK_FIELDS = [
  { key: "asterisk_ari_url",        label: "ARI URL",              type: "text",     placeholder: "http://localhost:8088" },
  { key: "asterisk_ari_username",   label: "ARI Username",         type: "text",     placeholder: "asterisk" },
  { key: "asterisk_ari_password",   label: "ARI Password",         type: "password", placeholder: "••••••••" },
  { key: "asterisk_ai_context",     label: "AI Context",           type: "text",     placeholder: "medical-receptionist" },
  { key: "asterisk_outbound_trunk", label: "Outbound Trunk",       type: "text",     placeholder: "PJSIP/trunk or SIP/provider" },
];

const VOICE_FIELDS = [
  { key: "call_language", label: "Call Language", type: "select", options: ["Tamil", "Hindi", "Telugu", "English"] },
];

function FieldRow({ fieldKey, label, type, placeholder, options, values, onChange }: {
  fieldKey: string; label: string; type: string; placeholder?: string;
  options?: string[]; values: Record<string, string>; onChange: (k: string, v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={fieldKey}>{label}</Label>
      {type === "select" && options ? (
        <Select value={values[fieldKey] || ""} onValueChange={v => onChange(fieldKey, v)}>
          <SelectTrigger id={fieldKey}>
            <SelectValue placeholder={`Select ${label}`} />
          </SelectTrigger>
          <SelectContent>
            {options.map(o => (
              <SelectItem key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          id={fieldKey}
          type={type as "text" | "password"}
          placeholder={placeholder}
          value={values[fieldKey] || ""}
          onChange={e => onChange(fieldKey, e.target.value)}
        />
      )}
    </div>
  );
}

export default function SettingsPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getSettings()
      .then(setValues)
      .catch(() => setError("Failed to load settings. Is the backend running?"))
      .finally(() => setLoading(false));
  }, []);

  function set(key: string, value: string) {
    setValues(v => ({ ...v, [key]: value }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await saveSettings(values);
      const raw = localStorage.getItem("dia_session");
      if (raw) {
        const session = JSON.parse(raw);
        session.clinic_name = values.clinic_name || session.clinic_name;
        session.doctor_name = values.doctor_name || session.doctor_name;
        localStorage.setItem("dia_session", JSON.stringify(session));
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-8 text-slate-400">Loading settings...</div>;

  return (
    <div className="p-8 max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Settings</h1>
            <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-bold rounded-full border border-amber-200">
              <ShieldCheck className="w-3 h-3" /> Super Admin
            </span>
          </div>
          <p className="text-slate-500 mt-1">Clinic info, access control, and Asterisk integration</p>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving}
          className={`flex items-center gap-1.5 ${saved ? "bg-green-600 hover:bg-green-700" : "bg-[#1a59d5] hover:bg-[#1548b8]"} text-white`}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : null}
          {saving ? "Saving..." : saved ? "Saved!" : "Save All Settings"}
        </Button>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>}

      {/* ── Clinic Information ── */}
      <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <span className="material-symbols-outlined text-[#1a59d5]" style={{fontSize:20}}>local_hospital</span>
          <h2 className="font-bold text-slate-900">Clinic Information</h2>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="clinic_name">Clinic / Hospital Name</Label>
            <Input
              id="clinic_name"
              placeholder="e.g. Chennai Diabetes Centre"
              value={values.clinic_name || ""}
              onChange={e => set("clinic_name", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doctor_name">Doctor Name</Label>
            <Input
              id="doctor_name"
              placeholder="e.g. Dr. Rajesh Kumar"
              value={values.doctor_name || ""}
              onChange={e => set("doctor_name", e.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="contact_email">Contact Email</Label>
            <Input
              id="contact_email"
              type="email"
              placeholder="clinic@example.com"
              value={values.contact_email || ""}
              onChange={e => set("contact_email", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contact_phone">Contact Phone</Label>
            <Input
              id="contact_phone"
              placeholder="+91 XXXXXXXXXX"
              value={values.contact_phone || ""}
              onChange={e => set("contact_phone", e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* ── Access Control ── */}
      <section className="bg-white rounded-xl border border-amber-200 p-6 space-y-4">
        <div className="flex items-center gap-2 border-b border-amber-100 pb-3">
          <span className="material-symbols-outlined text-amber-600" style={{fontSize:20}}>shield_lock</span>
          <h2 className="font-bold text-slate-900">Access Control</h2>
          <span className="ml-auto text-xs text-amber-600 font-medium">Clinic-level login credentials</span>
        </div>
        <p className="text-sm text-slate-500">
          Set the username and password doctors use to sign in. The super admin credentials
          (set via server <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">.env</code>) always work as an override.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="clinic_username">Doctor / Clinic Username</Label>
            <Input
              id="clinic_username"
              placeholder="e.g. drrajesh"
              value={values.clinic_username || ""}
              onChange={e => set("clinic_username", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="clinic_password">Doctor / Clinic Password</Label>
            <Input
              id="clinic_password"
              type="password"
              placeholder={values.clinic_password === "••••••••" ? "••••••••  (set)" : "Set a new password"}
              value={values.clinic_password || ""}
              onChange={e => set("clinic_password", e.target.value)}
            />
          </div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
          <strong>Super Admin override:</strong> The credentials in <code className="bg-amber-100 px-1 rounded">crm-backend/.env</code> (<code>SUPER_ADMIN_USERNAME</code> / <code>SUPER_ADMIN_PASSWORD</code>) always grant access regardless of what is set here.
        </div>
      </section>

      {/* ── Asterisk ARI ── */}
      <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <span className="material-symbols-outlined text-[#1a59d5]" style={{fontSize:20}}>phone</span>
          <h2 className="font-bold text-slate-900">Asterisk ARI</h2>
          <span className="ml-auto text-xs text-slate-400">AVA voice agent connection</span>
        </div>
        {ASTERISK_FIELDS.map(f => (
          <FieldRow key={f.key} fieldKey={f.key} label={f.label} type={f.type}
            placeholder={f.placeholder} values={values} onChange={set} />
        ))}
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700">
          AVA will POST call results to <code className="bg-blue-100 px-1 rounded">/api/calls/webhook</code> after each call.
          The AI context name maps to a context defined in AVA&apos;s <code className="bg-blue-100 px-1 rounded">ai-agent.yaml</code>.
        </div>
      </section>

      {/* ── Voice Settings ── */}
      <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <span className="material-symbols-outlined text-[#1a59d5]" style={{fontSize:20}}>settings_voice</span>
          <h2 className="font-bold text-slate-900">Voice Settings</h2>
        </div>
        {VOICE_FIELDS.map(f => (
          <FieldRow key={f.key} fieldKey={f.key} label={f.label} type={f.type}
            placeholder={f.placeholder} options={f.options} values={values} onChange={set} />
        ))}
      </section>
    </div>
  );
}
