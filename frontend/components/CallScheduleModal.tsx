"use client";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createSchedule, Patient } from "@/lib/api";

interface Props {
  patient: Patient | null;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  prefillNote?: string;
}

export default function CallScheduleModal({ patient, open, onClose, onSuccess, prefillNote }: Props) {
  const [scheduledAt, setScheduledAt] = useState("");
  const [recurrence, setRecurrence] = useState("none");
  const [notes, setNotes] = useState(prefillNote || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!patient || !scheduledAt) {
      setError("Please select a date and time.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await createSchedule(patient.id, {
        scheduled_at: new Date(scheduledAt).toISOString(),
        recurrence: recurrence as any,
        status: "pending",
        notes,
      });
      onSuccess?.();
      onClose();
      setScheduledAt("");
      setNotes("");
      setRecurrence("none");
    } catch (e: any) {
      setError(e.message || "Failed to schedule call");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule Call</DialogTitle>
          {patient && <p className="text-sm text-gray-500">For {patient.name}</p>}
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Date & Time</Label>
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Recurrence</Label>
            <Select value={recurrence} onValueChange={setRecurrence}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">One-time</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Textarea
              placeholder="Purpose of this call..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving} className="bg-[#1a59d5] hover:bg-[#1548b8]">
            {saving ? "Scheduling..." : "Schedule Call"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
