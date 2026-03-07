from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List, Any
from database import get_db
from sqlalchemy import text
from datetime import datetime, timedelta
import json

router = APIRouter(prefix="/api/patients", tags=["patients"])


class PatientUpdate(BaseModel):
    name: Optional[str] = None
    initials: Optional[str] = None
    phone: Optional[str] = None
    condition: Optional[str] = None
    severity: Optional[str] = None
    risk_reason: Optional[str] = None
    vitals: Optional[dict] = None
    vitals_history: Optional[list] = None
    compliance_score: Optional[int] = None
    lifestyle: Optional[dict] = None
    medications: Optional[list] = None
    call_protocol: Optional[dict] = None
    diet_rules: Optional[list] = None
    call_script_id: Optional[str] = None


class CareNoteCreate(BaseModel):
    note: str
    priority: str = "medium"
    created_by: str = "system"


class PatientCreate(BaseModel):
    name: str
    initials: Optional[str] = None
    phone: Optional[str] = None
    condition: str = "Type 2 Diabetes"
    severity: str = "medium"
    risk_reason: Optional[str] = None
    vitals: Optional[dict] = {}
    vitals_history: Optional[list] = []
    compliance_score: int = 0
    lifestyle: Optional[dict] = {}
    medications: Optional[list] = []
    call_protocol: Optional[dict] = {}
    diet_rules: Optional[list] = []
    call_script_id: Optional[str] = None


def _row_to_dict(row):
    return dict(row._mapping)


@router.get("/lookup")
async def lookup_patient_by_phone(phone: str):
    """
    Called by AVA's pre_call_lookup before the AI speaks.
    Returns patient context variables for prompt injection.
    """
    if not phone:
        raise HTTPException(status_code=400, detail="phone required")

    digits = phone.replace("+", "").replace(" ", "").replace("-", "")
    suffix = digits[-10:] if len(digits) >= 10 else digits

    with get_db() as db:
        row = db.execute(
            text("SELECT * FROM patients WHERE phone ILIKE :pat LIMIT 1"),
            {"pat": f"%{suffix}%"},
        ).fetchone()

    if not row:
        return {
            "id": "",
            "name": "there",
            "condition": "diabetes",
            "severity": "medium",
            "compliance_score": 0,
            "hba1c": "",
            "medications_summary": "",
            "focus_areas": "general check-in",
            "risk_reason": "",
        }

    p = _row_to_dict(row)
    vitals = p.get("vitals") or {}
    meds   = p.get("medications") or []
    proto  = p.get("call_protocol") or {}

    med_parts = []
    for m in meds:
        friendly = m.get("friendly_name") or m.get("name", "")
        dose     = m.get("dose", "")
        freq     = m.get("frequency", "")
        if friendly:
            med_parts.append(f"{friendly} {dose} {freq}".strip())
    medications_summary = "; ".join(med_parts) if med_parts else "not recorded"

    focus_areas = ", ".join(proto.get("ai_focus_areas") or []) or "general check-in"

    return {
        "id":          str(p.get("id", "")),
        "name":        p.get("name", "there"),
        "focus_areas": focus_areas,
        "notes":       p.get("risk_reason", ""),
        "label1":      p.get("condition", "diabetes"),
        "label2":      p.get("severity", "medium"),
        "detail1":     medications_summary,
        "detail2":     str(p.get("compliance_score", 0)) + "%",
    }


@router.get("")
def list_patients(
    search: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    sort: Optional[str] = Query("created_at"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
):
    sort_col = sort if sort in ("created_at", "compliance_score", "name") else "created_at"
    sort_dir = "ASC" if sort_col == "name" else "DESC"

    with get_db() as db:
        if severity and severity != "all":
            if severity == "high":
                rows = db.execute(
                    text(f"SELECT * FROM patients WHERE severity IN ('critical','high') ORDER BY {sort_col} {sort_dir}")
                ).fetchall()
            else:
                rows = db.execute(
                    text(f"SELECT * FROM patients WHERE severity = :sev ORDER BY {sort_col} {sort_dir}"),
                    {"sev": severity},
                ).fetchall()
        else:
            rows = db.execute(
                text(f"SELECT * FROM patients ORDER BY {sort_col} {sort_dir}")
            ).fetchall()

        patients = [_row_to_dict(r) for r in rows]

        if search:
            q = search.lower()
            patients = [
                p for p in patients
                if q in p.get("name", "").lower()
                or q in (p.get("phone") or "").lower()
                or q in p.get("condition", "").lower()
            ]

        patient_ids = [str(p["id"]) for p in patients]
        last_calls = {}
        if patient_ids:
            log_rows = db.execute(
                text("SELECT patient_id, started_at, summary, sentiment, outcome FROM call_logs ORDER BY started_at DESC")
            ).fetchall()
            for log in log_rows:
                pid = str(log.patient_id) if log.patient_id else None
                if pid and pid not in last_calls:
                    last_calls[pid] = _row_to_dict(log)

    for p in patients:
        lc = last_calls.get(str(p["id"]))
        p["last_call_date"] = lc["started_at"].isoformat() if lc and lc.get("started_at") else None
        p["last_call_summary"] = lc.get("summary") if lc else None
        p["last_call_sentiment"] = lc.get("sentiment") if lc else None
        p["last_call_outcome"] = lc.get("outcome") if lc else None

    total = len(patients)
    offset = (page - 1) * limit
    paginated = patients[offset: offset + limit]

    counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for p in patients:
        sev = p.get("severity", "medium")
        if sev in counts:
            counts[sev] += 1

    return {
        "patients": paginated,
        "severity_counts": counts,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": max(1, -(-total // limit)),
    }


@router.post("")
def create_patient(body: PatientCreate):
    data = body.model_dump(exclude_none=True)
    cols = ", ".join(data.keys())
    placeholders = ", ".join(f":{k}" for k in data.keys())
    # Serialize JSON fields
    for k in ("vitals", "vitals_history", "lifestyle", "medications", "call_protocol", "diet_rules"):
        if k in data and data[k] is not None:
            data[k] = json.dumps(data[k])
    with get_db() as db:
        row = db.execute(
            text(f"INSERT INTO patients ({cols}) VALUES ({placeholders}) RETURNING *"),
            data,
        ).fetchone()
        if not row:
            raise HTTPException(status_code=400, detail="Failed to create patient")
        return _row_to_dict(row)


@router.get("/{patient_id}")
def get_patient(patient_id: str):
    with get_db() as db:
        row = db.execute(
            text("SELECT * FROM patients WHERE id = :id"),
            {"id": patient_id},
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Patient not found")
        patient = _row_to_dict(row)

        notes_rows = db.execute(
            text("SELECT * FROM care_notes WHERE patient_id = :pid ORDER BY created_at DESC"),
            {"pid": patient_id},
        ).fetchall()
        patient["care_notes"] = [_row_to_dict(r) for r in notes_rows]

        log_rows = db.execute(
            text("SELECT * FROM call_logs WHERE patient_id = :pid ORDER BY started_at DESC LIMIT 10"),
            {"pid": patient_id},
        ).fetchall()
        patient["recent_call_logs"] = [_row_to_dict(r) for r in log_rows]

    return patient


@router.put("/{patient_id}")
def update_patient(patient_id: str, body: PatientUpdate):
    data = body.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    for k in ("vitals", "vitals_history", "lifestyle", "medications", "call_protocol", "diet_rules"):
        if k in data and data[k] is not None:
            data[k] = json.dumps(data[k])
    set_clause = ", ".join(f"{k} = :{k}" for k in data.keys())
    data["patient_id"] = patient_id
    with get_db() as db:
        row = db.execute(
            text(f"UPDATE patients SET {set_clause} WHERE id = :patient_id RETURNING *"),
            data,
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Patient not found")
        return _row_to_dict(row)


@router.post("/{patient_id}/snooze")
def snooze_patient(patient_id: str):
    """Delay all pending schedules for this patient by 1 day."""
    with get_db() as db:
        rows = db.execute(
            text("SELECT id, scheduled_at FROM call_schedules WHERE patient_id = :pid AND status = 'pending'"),
            {"pid": patient_id},
        ).fetchall()
        updated = 0
        for s in rows:
            try:
                dt = s.scheduled_at
                if isinstance(dt, str):
                    dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
                new_dt = dt + timedelta(days=1)
                db.execute(
                    text("UPDATE call_schedules SET scheduled_at = :new_dt WHERE id = :id"),
                    {"new_dt": new_dt.isoformat(), "id": str(s.id)},
                )
                updated += 1
            except Exception:
                pass
    return {"ok": True, "snoozed_count": updated}


@router.get("/{patient_id}/schedules")
def get_schedules(patient_id: str):
    with get_db() as db:
        rows = db.execute(
            text("SELECT * FROM call_schedules WHERE patient_id = :pid ORDER BY scheduled_at"),
            {"pid": patient_id},
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


@router.post("/{patient_id}/schedules")
def create_schedule(patient_id: str, body: dict):
    body["patient_id"] = patient_id
    cols = ", ".join(body.keys())
    placeholders = ", ".join(f":{k}" for k in body.keys())
    with get_db() as db:
        row = db.execute(
            text(f"INSERT INTO call_schedules ({cols}) VALUES ({placeholders}) RETURNING *"),
            body,
        ).fetchone()
        if not row:
            raise HTTPException(status_code=400, detail="Failed to create schedule")
        return _row_to_dict(row)


@router.get("/{patient_id}/call-logs")
def get_call_logs(patient_id: str):
    with get_db() as db:
        rows = db.execute(
            text("SELECT * FROM call_logs WHERE patient_id = :pid ORDER BY started_at DESC"),
            {"pid": patient_id},
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


@router.post("/{patient_id}/call-logs")
def create_call_log(patient_id: str, body: dict):
    body["patient_id"] = patient_id
    for k in ("transcript", "tool_calls"):
        if k in body and body[k] is not None:
            body[k] = json.dumps(body[k])
    cols = ", ".join(body.keys())
    placeholders = ", ".join(f":{k}" for k in body.keys())
    with get_db() as db:
        row = db.execute(
            text(f"INSERT INTO call_logs ({cols}) VALUES ({placeholders}) RETURNING *"),
            body,
        ).fetchone()
        if not row:
            raise HTTPException(status_code=400, detail="Failed to create call log")
        return _row_to_dict(row)


@router.put("/{patient_id}/call-logs/{log_id}")
def update_call_log(patient_id: str, log_id: str, body: dict):
    for k in ("transcript", "tool_calls"):
        if k in body and body[k] is not None:
            body[k] = json.dumps(body[k])
    set_clause = ", ".join(f"{k} = :{k}" for k in body.keys())
    body["log_id"] = log_id
    body["patient_id"] = patient_id
    with get_db() as db:
        row = db.execute(
            text(f"UPDATE call_logs SET {set_clause} WHERE id = :log_id AND patient_id = :patient_id RETURNING *"),
            body,
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Call log not found")
        return _row_to_dict(row)


@router.post("/{patient_id}/care-notes")
def add_care_note(patient_id: str, body: CareNoteCreate):
    data = body.model_dump()
    data["patient_id"] = patient_id
    cols = ", ".join(data.keys())
    placeholders = ", ".join(f":{k}" for k in data.keys())
    with get_db() as db:
        row = db.execute(
            text(f"INSERT INTO care_notes ({cols}) VALUES ({placeholders}) RETURNING *"),
            data,
        ).fetchone()
        if not row:
            raise HTTPException(status_code=400, detail="Failed to create care note")
        return _row_to_dict(row)
