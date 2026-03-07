-- DiaCare CRM Schema
-- Run this in Supabase SQL Editor

-- ─── Extensions ──────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── Tables ──────────────────────────────────────────────────────────────────

create table if not exists patients (
  id               uuid primary key default uuid_generate_v4(),
  name             text not null,
  initials         text,
  phone            text,
  condition        text default 'Type 2 Diabetes',
  severity         text check (severity in ('critical','high','medium','low')) default 'medium',
  risk_reason      text,
  vitals           jsonb default '{}',
  vitals_history   jsonb default '[]',
  compliance_score integer default 0 check (compliance_score between 0 and 100),
  lifestyle        jsonb default '{}',
  medications      jsonb default '[]',
  call_protocol    jsonb default '{}',
  diet_rules       jsonb default '[]',
  created_at       timestamptz default now()
);

create table if not exists call_scripts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  language    text default 'Tamil',
  nodes       jsonb not null default '[]',
  edges       jsonb not null default '[]',
  is_default  boolean default false,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table if not exists call_schedules (
  id           uuid primary key default uuid_generate_v4(),
  patient_id   uuid references patients(id) on delete cascade,
  scheduled_at timestamptz not null,
  recurrence   text check (recurrence in ('none','daily','weekly')) default 'none',
  status       text check (status in ('pending','completed','missed','cancelled')) default 'pending',
  notes        text,
  created_at   timestamptz default now()
);

create table if not exists call_logs (
  id            uuid primary key default uuid_generate_v4(),
  patient_id    uuid references patients(id) on delete cascade,
  schedule_id   uuid references call_schedules(id) on delete set null,
  started_at    timestamptz default now(),
  ended_at      timestamptz,
  duration_secs integer,
  transcript    jsonb default '[]',
  summary       text,
  sentiment     text check (sentiment in ('positive','neutral','negative','unknown')) default 'unknown',
  outcome       text,
  tool_calls    jsonb default '[]',
  created_at    timestamptz default now()
);

create table if not exists care_notes (
  id         uuid primary key default uuid_generate_v4(),
  patient_id uuid references patients(id) on delete cascade,
  note       text not null,
  priority   text check (priority in ('high','medium','low')) default 'medium',
  created_at timestamptz default now(),
  created_by text default 'system'
);

create table if not exists settings (
  id         uuid primary key default uuid_generate_v4(),
  key        text unique not null,
  value      text,
  updated_at timestamptz default now()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────
create index if not exists idx_patients_severity on patients(severity);
create index if not exists idx_call_scripts_is_default on call_scripts(is_default);
create index if not exists idx_call_schedules_patient on call_schedules(patient_id);
create index if not exists idx_call_schedules_status on call_schedules(status);
create index if not exists idx_call_logs_patient on call_logs(patient_id);
create index if not exists idx_care_notes_patient on care_notes(patient_id);

-- ─── Seed: Default Settings ───────────────────────────────────────────────────
insert into settings (key, value) values
  ('asterisk_ari_url',        'http://localhost:8088'),
  ('asterisk_ari_username',   'asterisk'),
  ('asterisk_ari_password',   ''),
  ('asterisk_ai_context',     'medical-receptionist'),
  ('asterisk_outbound_trunk', ''),
  ('call_language',           'English')
on conflict (key) do nothing;

-- No patient seed data — add real patients through the CRM UI.
