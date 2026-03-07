import os
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import get_db
from sqlalchemy import text
from routers import patients, schedules, settings as settings_router, scripts, calls
from datetime import datetime, timedelta

app = FastAPI(title="DiaCare CRM API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(patients.router)
app.include_router(schedules.router)
app.include_router(settings_router.router)
app.include_router(scripts.router)
app.include_router(calls.router, prefix="/api/calls")


@app.get("/api/stats")
def get_stats():
    with get_db() as db:
        patients_rows = db.execute(
            text("SELECT severity, compliance_score, created_at FROM patients")
        ).fetchall()
        patients_data = [dict(r._mapping) for r in patients_rows]

        schedules_rows = db.execute(
            text("SELECT status FROM call_schedules")
        ).fetchall()
        schedules_data = [dict(r._mapping) for r in schedules_rows]

        logs_rows = db.execute(
            text("SELECT sentiment, duration_secs, started_at FROM call_logs")
        ).fetchall()
        logs_data = [dict(r._mapping) for r in logs_rows]

    severity_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for p in patients_data:
        sev = p.get("severity", "medium")
        if sev in severity_counts:
            severity_counts[sev] += 1

    sched_counts = {"pending": 0, "completed": 0, "missed": 0, "cancelled": 0}
    for s in schedules_data:
        st = s.get("status", "pending")
        if st in sched_counts:
            sched_counts[st] += 1

    total_duration = sum(l.get("duration_secs") or 0 for l in logs_data)
    total_calls    = len(logs_data)

    completed_logs = [l for l in logs_data if l.get("duration_secs")]
    avg_duration   = round(sum(l["duration_secs"] for l in completed_logs) / len(completed_logs)) if completed_logs else 0

    sentiment_counts = {"positive": 0, "neutral": 0, "negative": 0, "unknown": 0}
    for l in logs_data:
        s = l.get("sentiment", "unknown")
        if s in sentiment_counts:
            sentiment_counts[s] += 1

    total_sched    = len(schedules_data)
    completed_sched = sched_counts["completed"]
    pickup_rate    = round((completed_sched / total_sched) * 100) if total_sched > 0 else 0

    calls_by_day = [0] * 7
    for l in logs_data:
        started = l.get("started_at")
        if started:
            try:
                if hasattr(started, "weekday"):
                    calls_by_day[started.weekday()] += 1
                else:
                    dt = datetime.fromisoformat(str(started).replace("Z", "+00:00"))
                    calls_by_day[dt.weekday()] += 1
            except Exception:
                pass

    now = datetime.utcnow()
    calls_by_week = []
    for w in range(5, -1, -1):
        week_start = now - timedelta(weeks=w + 1)
        week_end   = now - timedelta(weeks=w)
        count = 0
        for l in logs_data:
            started = l.get("started_at")
            if started:
                try:
                    if hasattr(started, "replace"):
                        dt = started.replace(tzinfo=None) if hasattr(started, "tzinfo") else started
                    else:
                        dt = datetime.fromisoformat(str(started).replace("Z", "+00:00")).replace(tzinfo=None)
                    if week_start <= dt < week_end:
                        count += 1
                except Exception:
                    pass
        calls_by_week.append(count)

    compliance_scores = [p.get("compliance_score", 0) for p in patients_data]
    avg_compliance    = round(sum(compliance_scores) / len(compliance_scores)) if compliance_scores else 0

    return {
        "total_patients":           len(patients_data),
        "severity_counts":          severity_counts,
        "schedule_counts":          sched_counts,
        "total_calls":              total_calls,
        "total_call_duration_secs": total_duration,
        "avg_call_duration_secs":   avg_duration,
        "sentiment_counts":         sentiment_counts,
        "pickup_rate":              pickup_rate,
        "calls_by_day":             calls_by_day,
        "calls_by_week":            calls_by_week,
        "avg_compliance":           avg_compliance,
    }


@app.post("/api/auth/verify")
def verify_auth(body: dict):
    username = (body.get("username") or "").strip()
    password = body.get("password") or ""

    super_user = os.getenv("SUPER_ADMIN_USERNAME", "admin")
    super_pass = os.getenv("SUPER_ADMIN_PASSWORD", "diacare2024")

    with get_db() as db:
        rows = db.execute(text("SELECT key, value FROM settings")).fetchall()
    settings = {r.key: r.value for r in rows}

    clinic_name  = settings.get("clinic_name", "DiaCare CRM")
    doctor_name  = settings.get("doctor_name", "")

    if username == super_user and password == super_pass:
        return {"ok": True, "role": "superadmin", "clinic_name": clinic_name, "doctor_name": doctor_name}

    clinic_user = settings.get("clinic_username", "")
    clinic_pass = settings.get("clinic_password", "")
    if clinic_user and clinic_pass and username == clinic_user and password == clinic_pass:
        return {"ok": True, "role": "doctor", "clinic_name": clinic_name, "doctor_name": doctor_name}

    return {"ok": False, "role": None, "clinic_name": None, "doctor_name": None}


@app.get("/health")
def health():
    return {"status": "ok", "service": "DiaCare CRM API"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8001))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
