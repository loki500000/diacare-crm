"use client";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Patient, originateCall } from "@/lib/api";
import { PhoneCall, PhoneOff, Clock, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

interface Props {
  patient: Patient | null;
  open: boolean;
  onClose: () => void;
  onCallEnd?: () => void;
}

type CallStatus = "idle" | "dialing" | "active" | "ended" | "error";

export default function CallModal({ patient, open, onClose, onCallEnd }: Props) {
  const [status, setStatus]       = useState<CallStatus>("idle");
  const [error, setError]         = useState("");
  const [channelId, setChannelId] = useState("");
  const [duration, setDuration]   = useState(0);
  const timerRef = { current: null as ReturnType<typeof setInterval> | null };

  function reset() {
    setStatus("idle");
    setError("");
    setChannelId("");
    setDuration(0);
    if (timerRef.current) clearInterval(timerRef.current);
  }

  async function startCall() {
    if (!patient) return;
    setStatus("dialing");
    setError("");

    try {
      const result = await originateCall(patient.id);
      setChannelId(result.channel_id || "");
      setStatus("active");
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    } catch (err: any) {
      const msg = err?.message || "Failed to initiate call";
      setError(msg);
      setStatus("error");
    }
  }

  function endCall() {
    if (timerRef.current) clearInterval(timerRef.current);
    setStatus("ended");
    onCallEnd?.();
  }

  function formatDuration(secs: number) {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  const statusBar = {
    idle:    { bg: "bg-blue-50 border-blue-200",    dot: "bg-blue-400",              label: "Ready to call via Asterisk" },
    dialing: { bg: "bg-yellow-50 border-yellow-200", dot: "bg-yellow-500 animate-pulse", label: "Dialing patient..." },
    active:  { bg: "bg-green-50 border-green-200",  dot: "bg-green-500 animate-pulse", label: "Call active — AVA is handling the conversation" },
    ended:   { bg: "bg-gray-50 border-gray-200",    dot: "bg-gray-400",              label: "Call ended" },
    error:   { bg: "bg-red-50 border-red-200",      dot: "bg-red-500",               label: "Call failed" },
  }[status];

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PhoneCall className="w-5 h-5 text-[#1a59d5]" />
            Call Patient
            {patient && <span className="text-gray-500 font-normal">— {patient.name}</span>}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status bar */}
          <div className={`flex items-center justify-between p-3 rounded-lg border ${statusBar.bg}`}>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${statusBar.dot}`} />
              <span className="text-sm font-medium">{statusBar.label}</span>
            </div>
            {status === "active" && (
              <span className="flex items-center gap-1 text-sm text-green-700 font-mono">
                <Clock className="w-3.5 h-3.5" />
                {formatDuration(duration)}
              </span>
            )}
          </div>

          {/* Patient info */}
          {patient && (
            <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
              <p><span className="text-gray-500">Phone:</span> <strong>{patient.phone || "—"}</strong></p>
              <p><span className="text-gray-500">Condition:</span> {patient.condition}</p>
              <p><span className="text-gray-500">Severity:</span> <span className={`font-semibold capitalize ${
                patient.severity === "critical" ? "text-red-600" :
                patient.severity === "high"     ? "text-orange-500" :
                patient.severity === "medium"   ? "text-yellow-600" : "text-green-600"
              }`}>{patient.severity}</span></p>
              <p><span className="text-gray-500">Compliance:</span> {patient.compliance_score}%</p>
            </div>
          )}

          {/* Active call info */}
          {status === "active" && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-green-700 space-y-1">
              <p className="font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Asterisk is connecting to patient
              </p>
              <p>AVA will handle the conversation. Call transcript and summary will be saved automatically when the call ends.</p>
              {channelId && <p className="font-mono text-green-600">Channel: {channelId}</p>}
            </div>
          )}

          {/* Error */}
          {status === "error" && error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 space-y-1">
              <p className="font-semibold flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" /> {error}
              </p>
              <p className="text-red-500">Check Asterisk ARI settings in Settings → Asterisk ARI.</p>
            </div>
          )}

          {/* Ended */}
          {status === "ended" && (
            <div className="text-center py-2 text-gray-600 text-sm">
              Call session ended. AVA will update the call log with transcript and summary shortly.
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { reset(); onClose(); }}>Close</Button>

            {(status === "idle" || status === "error") && (
              <Button
                onClick={startCall}
                disabled={!patient?.phone}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <PhoneCall className="w-4 h-4 mr-1.5" />
                {status === "error" ? "Retry" : "Start Call"}
              </Button>
            )}

            {status === "dialing" && (
              <Button disabled className="bg-yellow-500 text-white">
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                Dialing...
              </Button>
            )}

            {status === "active" && (
              <Button onClick={endCall} className="bg-red-600 hover:bg-red-700 text-white">
                <PhoneOff className="w-4 h-4 mr-1.5" />
                End Session
              </Button>
            )}

            {status === "ended" && (
              <Button onClick={reset} className="bg-[#1a59d5] hover:bg-[#1548b8] text-white">
                New Call
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
