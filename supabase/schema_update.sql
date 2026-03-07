-- ============================================================
-- DiaCare CRM — Schema Update
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard
-- Project: hcywfnfcfmrzcycrghye
-- ============================================================

-- 1. Add vitals_history column to patients
--    Stores array of historical readings: [{date, hba1c, bp, fasting_glucose, weight_kg}]
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS vitals_history jsonb DEFAULT '[]'::jsonb;

-- 2. Add call_protocol column to patients
--    Stores AI calling instructions per patient:
--    {
--      call_count_per_week: 3,
--      preferred_times: ["09:00", "14:00"],
--      ai_focus_areas: ["medication", "vitals", "lifestyle"],
--      custom_instructions: "Ask about insulin dosage first"
--    }
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS call_protocol jsonb DEFAULT '{}'::jsonb;

-- 3. Daily snapshot table for triage trend cards
--    Stores severity counts each day so we can compare today vs yesterday/last week
CREATE TABLE IF NOT EXISTS daily_snapshots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  critical_count  int NOT NULL DEFAULT 0,
  high_count      int NOT NULL DEFAULT 0,
  medium_count    int NOT NULL DEFAULT 0,
  low_count       int NOT NULL DEFAULT 0,
  total_count     int NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS daily_snapshots_date_idx ON daily_snapshots(snapshot_date);

-- 4. Insert today's snapshot (will be updated by backend on each stats call)
INSERT INTO daily_snapshots (snapshot_date, critical_count, high_count, medium_count, low_count, total_count)
SELECT
  CURRENT_DATE,
  COUNT(*) FILTER (WHERE severity = 'critical'),
  COUNT(*) FILTER (WHERE severity = 'high'),
  COUNT(*) FILTER (WHERE severity = 'medium'),
  COUNT(*) FILTER (WHERE severity = 'low'),
  COUNT(*)
FROM patients
ON CONFLICT (snapshot_date) DO NOTHING;
