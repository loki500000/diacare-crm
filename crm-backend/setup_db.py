"""
Run this once to create all Supabase tables.
Usage: python setup_db.py
"""
import os
import requests
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SERVICE_KEY  = os.getenv("SUPABASE_SERVICE_KEY")

# SQL statements — split into individual executable units
STATEMENTS = [
    "create extension if not exists \"uuid-ossp\"",

    """create table if not exists patients (
      id               uuid primary key default uuid_generate_v4(),
      name             text not null,
      initials         text,
      phone            text,
      condition        text default 'Type 2 Diabetes',
      severity         text check (severity in ('critical','high','medium','low')) default 'medium',
      risk_reason      text,
      vitals           jsonb default '{}',
      compliance_score integer default 0 check (compliance_score between 0 and 100),
      lifestyle        jsonb default '{}',
      medications      jsonb default '[]',
      created_at       timestamptz default now()
    )""",

    """create table if not exists call_schedules (
      id           uuid primary key default uuid_generate_v4(),
      patient_id   uuid references patients(id) on delete cascade,
      scheduled_at timestamptz not null,
      recurrence   text check (recurrence in ('none','daily','weekly')) default 'none',
      status       text check (status in ('pending','completed','missed','cancelled')) default 'pending',
      notes        text,
      created_at   timestamptz default now()
    )""",

    """create table if not exists call_logs (
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
    )""",

    """create table if not exists care_notes (
      id         uuid primary key default uuid_generate_v4(),
      patient_id uuid references patients(id) on delete cascade,
      note       text not null,
      priority   text check (priority in ('high','medium','low')) default 'medium',
      created_at timestamptz default now(),
      created_by text default 'system'
    )""",

    """create table if not exists settings (
      id         uuid primary key default uuid_generate_v4(),
      key        text unique not null,
      value      text,
      updated_at timestamptz default now()
    )""",

    "create index if not exists idx_patients_severity on patients(severity)",
    "create index if not exists idx_call_schedules_patient on call_schedules(patient_id)",
    "create index if not exists idx_call_schedules_status on call_schedules(status)",
    "create index if not exists idx_call_logs_patient on call_logs(patient_id)",
    "create index if not exists idx_care_notes_patient on care_notes(patient_id)",

    # Default settings
    """insert into settings (key, value) values
      ('asterisk_ari_url',        'http://localhost:8088'),
      ('asterisk_ari_username',   'asterisk'),
      ('asterisk_ari_password',   ''),
      ('asterisk_ai_context',     'medical-receptionist'),
      ('asterisk_outbound_trunk', ''),
      ('call_language',           'English')
      on conflict (key) do nothing""",
]


def run_sql(sql: str) -> dict:
    """Execute SQL via Supabase Management API."""
    url = f"{SUPABASE_URL}/rest/v1/rpc/exec_sql"
    # Try Management API endpoint
    mgmt_url = f"https://api.supabase.com/v1/projects/{SUPABASE_URL.split('.')[0].replace('https://', '')}/database/query"

    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
    }

    # Try direct postgres via Supabase's internal SQL endpoint
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/exec_sql",
        headers=headers,
        json={"sql": sql},
        timeout=10,
    )
    return resp


def main():
    print(f"Connecting to: {SUPABASE_URL}")

    errors = []
    for i, stmt in enumerate(STATEMENTS, 1):
        preview = stmt.strip()[:60].replace("\n", " ")
        resp = run_sql(stmt)
        if resp.status_code in (200, 201, 204):
            print(f"  ✓ [{i}/{len(STATEMENTS)}] {preview}...")
        elif resp.status_code == 404:
            # exec_sql function not available — print instructions
            print(f"\n⚠️  The exec_sql RPC function is not available.")
            print("   Please run the schema manually in the Supabase Dashboard:")
            print(f"   1. Go to: https://supabase.com/dashboard/project/hcywfnfcfmrzcycrghye/sql/new")
            print(f"   2. Copy the contents of: supabase/schema.sql")
            print(f"   3. Paste and click Run\n")
            return
        else:
            txt = resp.text[:200]
            # Ignore "already exists" errors
            if "already exists" in txt or "duplicate" in txt.lower():
                print(f"  ~ [{i}/{len(STATEMENTS)}] already exists — skipped")
            else:
                print(f"  ✗ [{i}/{len(STATEMENTS)}] {preview}... FAILED: {txt}")
                errors.append(txt)

    if not errors:
        print("\n✅ Database setup complete!")
    else:
        print(f"\n⚠️  Completed with {len(errors)} error(s).")


if __name__ == "__main__":
    main()
