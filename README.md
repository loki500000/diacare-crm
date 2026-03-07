# DiaCare CRM

A diabetes patient management platform with an integrated AI voice agent for automated patient follow-up calls.

---

## Overview

DiaCare CRM helps clinics manage diabetic patients, schedule and track follow-up calls, and automate patient outreach using an AI voice agent powered by OpenAI's GPT-4o Realtime API over Asterisk.

### Key Features

- **Patient Management** — Track patients with condition details, severity, vitals, medications, compliance scores, and lifestyle data
- **Call Scheduling** — Schedule one-off or recurring (daily/weekly) calls per patient
- **AI Voice Calls** — Automated outbound calls via AVA (Asterisk AI Voice Agent) with per-patient context injection
- **Call Logs & Transcripts** — Full call history with transcripts, sentiment analysis, and summaries
- **Analytics Dashboard** — Patient severity breakdown, call volume trends, compliance averages, pickup rates
- **Triage View** — Prioritised patient list by severity and risk
- **Call Script Builder** — Visual flow editor for call scripts
- **Settings** — Clinic profile, Asterisk ARI credentials, admin account

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Browser                                            │
│  Next.js Frontend  (port 3000)                      │
└────────────────────┬────────────────────────────────┘
                     │ REST API
┌────────────────────▼────────────────────────────────┐
│  FastAPI Backend   (port 8001)                      │
│  SQLAlchemy → PostgreSQL                            │
└────────────────────┬────────────────────────────────┘
                     │ CRM Lookup / Webhook
┌────────────────────▼────────────────────────────────┐
│  AVA AI Voice Agent (Docker, port 3003 admin UI)    │
│  Asterisk ARI ↔ AudioSocket ↔ OpenAI Realtime API  │
└─────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind CSS |
| Backend | FastAPI, SQLAlchemy 2, Pydantic, Uvicorn |
| Database | PostgreSQL (Supabase-compatible schema) |
| Voice Agent | AVA v6.3.1 (Asterisk AI Voice Agent), Docker Compose |
| AI Model | OpenAI GPT-4o Realtime (`gpt-4o-realtime-preview`) |
| Voice Transport | Asterisk ARI + AudioSocket |

---

## Repository Structure

```
diacare-crm/
├── frontend/                      # Next.js application
│   └── app/
│       ├── page.tsx               # Dashboard
│       ├── patients/              # Patient list + detail pages
│       ├── triage/                # Severity triage view
│       ├── analytics/             # Analytics dashboard
│       ├── voice-ai/              # Voice AI control panel
│       └── settings/              # Clinic & system settings
├── crm-backend/                   # FastAPI application
│   ├── main.py                    # App entry point, stats & auth endpoints
│   ├── database.py                # SQLAlchemy connection
│   ├── routers/
│   │   ├── patients.py            # Patient CRUD + lookup
│   │   ├── schedules.py           # Call schedule management
│   │   ├── calls.py               # Call logs + AVA webhook receiver
│   │   ├── scripts.py             # Call script CRUD
│   │   └── settings.py            # Clinic settings CRUD
│   └── requirements.txt
├── AVA-AI-Voice-Agent-for-Asterisk/  # AVA voice agent (submodule/clone)
├── supabase/
│   ├── schema.sql                 # Full DB schema
│   └── schema_update.sql          # Migration patches
└── install-diacare.sh             # One-shot Debian/Ubuntu installer
```

---

## Quick Start (Development)

### Prerequisites

- Python 3.11+
- Node.js 20+
- PostgreSQL 14+
- Docker & Docker Compose (for AVA)
- OpenAI API key

### 1. Database

```bash
createdb diacare
psql -d diacare -f supabase/schema.sql
```

### 2. Backend

```bash
cd crm-backend
cp .env.example .env   # or create .env manually (see below)
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

**`crm-backend/.env`**

```env
DATABASE_URL=postgresql://diacare:diacare2024@localhost:5432/diacare
PORT=8001
SUPER_ADMIN_USERNAME=admin
SUPER_ADMIN_PASSWORD=diacare2024
```

### 3. Frontend

```bash
cd frontend
echo "NEXT_PUBLIC_API_URL=http://localhost:8001" > .env.local
npm install
npm run dev
```

Frontend available at `http://localhost:3000`.

### 4. AVA Voice Agent

```bash
cd AVA-AI-Voice-Agent-for-Asterisk
cp .env.example .env   # fill in OPENAI_API_KEY and Asterisk ARI credentials
docker compose up -d
```

AVA Admin UI at `http://localhost:3003`.

---

## Production Install (Debian / Ubuntu)

An automated installer handles all services as systemd units and starts AVA via Docker Compose:

```bash
sudo bash install-diacare.sh
```

The script will prompt for:
- PostgreSQL credentials
- Asterisk ARI host/port/credentials and outbound trunk
- OpenAI API key
- Admin username & password
- Optional custom CRM agent prompt

After completion:

| Service | URL |
|---|---|
| DiaCare CRM | `http://<host>:3000` |
| CRM API | `http://<host>:8001` |
| API Health | `http://<host>:8001/health` |
| AVA Admin UI | `http://<host>:3003` |

---

## API Reference

### Auth

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/verify` | Login — returns role, clinic name |

### Patients

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/patients` | List all patients |
| `POST` | `/api/patients` | Create patient |
| `GET` | `/api/patients/{id}` | Get patient detail |
| `PUT` | `/api/patients/{id}` | Update patient |
| `DELETE` | `/api/patients/{id}` | Delete patient |
| `GET` | `/api/patients/lookup` | AVA CRM lookup by phone number |

### Schedules

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/schedules` | List call schedules |
| `POST` | `/api/schedules` | Create schedule |
| `PUT` | `/api/schedules/{id}` | Update schedule |
| `DELETE` | `/api/schedules/{id}` | Delete schedule |

### Calls

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/calls` | List call logs |
| `POST` | `/api/calls/webhook` | AVA call result webhook |

### Stats & Settings

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/stats` | Dashboard stats |
| `GET` | `/api/settings` | Get all settings |
| `PUT` | `/api/settings` | Update settings |
| `GET` | `/health` | Health check |

---

## AVA Integration

DiaCare integrates with AVA via two endpoints configured in `AVA_DIR/.env`:

```env
CRM_LOOKUP_URL=http://localhost:8001/api/patients/lookup
CRM_WEBHOOK_URL=http://localhost:8001/api/calls/webhook
```

When AVA places an outbound call, it:
1. Calls `CRM_LOOKUP_URL` with the patient's phone number to fetch name, condition, severity, medications, and compliance score
2. Injects this data into the AI agent prompt using AVA's `{contact_*}` template variables
3. Posts the call result (transcript, sentiment, duration, summary) back to `CRM_WEBHOOK_URL`

The AI agent prompt template (configurable via `CRM_AGENT_PROMPT`):

```
You are a compassionate AI health assistant for DiaCare. The patient is {contact_name},
condition: {contact_label1}, severity: {contact_label2}, medications: {contact_detail1},
compliance: {contact_detail2}. Check in on their health, ask about medications and blood
sugar. Keep it under 5 minutes. Never provide medical diagnoses.
```

---

## Default Login

| Role | Username | Password |
|---|---|---|
| Super Admin | `admin` | `diacare2024` |

Change credentials in `crm-backend/.env` or via **Settings** in the CRM.

---

## License

MIT
