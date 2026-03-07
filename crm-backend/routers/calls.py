from fastapi import APIRouter, HTTPException
from datetime import datetime, timedelta, timezone
from database import get_db
from sqlalchemy import text
import httpx
import json

router = APIRouter()


def _row_to_dict(row):
    return dict(row._mapping)


# ── POST /api/calls/webhook ───────────────────────────────────────────────────

@router.post("/webhook")
async def asterisk_call_webhook(body: dict):
    """
    Receive call completion data from AVA (Asterisk AI Voice Agent).
    AVA posts this via its post_call_webhook tool after each call.
    """
    caller_id   = body.get("caller_id") or body.get("phone", "")
    transcript  = body.get("transcript", [])
    summary     = body.get("summary", "")
    sentiment   = body.get("sentiment", "unknown")
    duration    = body.get("duration_secs") or body.get("duration")
    outcome     = body.get("outcome", "answered")
    started_at  = body.get("started_at")
    ended_at    = body.get("ended_at")
    tool_calls  = body.get("tool_calls", [])

    patient_id = None
    if caller_id:
        digits = caller_id.replace("+", "").replace(" ", "").replace("-", "")
        suffix = digits[-10:] if len(digits) >= 10 else digits
        with get_db() as db:
            row = db.execute(
                text("SELECT id FROM patients WHERE phone ILIKE :pat LIMIT 1"),
                {"pat": f"%{suffix}%"},
            ).fetchone()
            if row:
                patient_id = str(row.id)

    log_row = {
        "patient_id":    patient_id,
        "started_at":    started_at or datetime.now(timezone.utc).isoformat(),
        "ended_at":      ended_at,
        "duration_secs": int(duration) if duration else None,
        "transcript":    json.dumps(transcript),
        "summary":       summary,
        "sentiment":     sentiment if sentiment in ("positive", "neutral", "negative") else "unknown",
        "outcome":       outcome,
        "tool_calls":    json.dumps(tool_calls),
    }
    # Remove None values to avoid insert issues
    log_row = {k: v for k, v in log_row.items() if v is not None}

    cols = ", ".join(log_row.keys())
    placeholders = ", ".join(f":{k}" for k in log_row.keys())

    with get_db() as db:
        row = db.execute(
            text(f"INSERT INTO call_logs ({cols}) VALUES ({placeholders}) RETURNING id"),
            log_row,
        ).fetchone()
        call_log_id = str(row.id) if row else None

    return {
        "ok":          True,
        "call_log_id": call_log_id,
        "patient_id":  patient_id,
    }


# ── POST /api/calls/originate ─────────────────────────────────────────────────

@router.post("/originate")
async def originate_call(body: dict):
    """
    Trigger an outbound call from Asterisk ARI.
    Body: { patient_id: str, context?: str }
    """
    patient_id = body.get("patient_id")
    if not patient_id:
        raise HTTPException(status_code=400, detail="patient_id required")

    with get_db() as db:
        p_row = db.execute(
            text("SELECT id, name, phone FROM patients WHERE id = :id"),
            {"id": patient_id},
        ).fetchone()
        if not p_row:
            raise HTTPException(status_code=404, detail="Patient not found")
        patient = _row_to_dict(p_row)

        s_rows = db.execute(
            text("""
                SELECT key, value FROM settings
                WHERE key IN (
                    'asterisk_ari_url', 'asterisk_ari_username', 'asterisk_ari_password',
                    'asterisk_ai_context', 'asterisk_outbound_trunk'
                )
            """)
        ).fetchall()
        cfg = {r.key: r.value for r in s_rows}

    phone = (patient.get("phone") or "").strip()
    if not phone:
        raise HTTPException(status_code=400, detail="Patient has no phone number")

    digits = phone.replace("+", "").replace(" ", "").replace("-", "")
    if len(digits) == 10:
        digits = "91" + digits

    ari_url    = (cfg.get("asterisk_ari_url") or "http://localhost:8088").rstrip("/")
    ari_user   = cfg.get("asterisk_ari_username") or "asterisk"
    ari_pass   = cfg.get("asterisk_ari_password") or ""
    ai_context = body.get("context") or cfg.get("asterisk_ai_context") or "medical-receptionist"
    trunk      = cfg.get("asterisk_outbound_trunk") or f"PJSIP/{digits}"

    ari_payload = {
        "endpoint":    trunk,
        "app":         "asterisk-ai-voice-agent",
        "appArgs":     ai_context,
        "timeout":     60,
        "callerId":    f"DiaCare <{digits}>",
        "channelVars": {
            "AI_CONTEXT": ai_context,
            "AI_PROVIDER": "",
        },
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{ari_url}/ari/channels",
                json=ari_payload,
                auth=(ari_user, ari_pass),
            )
            resp.raise_for_status()
            channel = resp.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Asterisk ARI error: {e.response.text}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Asterisk unreachable: {str(e)}")

    with get_db() as db:
        log_row = db.execute(
            text("""
                INSERT INTO call_logs (patient_id, started_at, sentiment, outcome, transcript, tool_calls)
                VALUES (:patient_id, :started_at, 'unknown', 'initiated', '[]', '[]')
                RETURNING id
            """),
            {
                "patient_id": patient_id,
                "started_at": datetime.now(timezone.utc).isoformat(),
            },
        ).fetchone()
        call_log_id = str(log_row.id) if log_row else None

    return {
        "ok":           True,
        "call_log_id":  call_log_id,
        "channel_id":   channel.get("id"),
        "patient_name": patient.get("name"),
        "phone":        phone,
        "context":      ai_context,
    }


# ── GET /api/calls/stats ──────────────────────────────────────────────────────

@router.get("/stats")
async def get_call_stats(hours_back: int = 24):
    """Return call stats from local call_logs table."""
    since = (datetime.now(timezone.utc) - timedelta(hours=hours_back)).isoformat()

    with get_db() as db:
        rows = db.execute(
            text("SELECT outcome, duration_secs, sentiment FROM call_logs WHERE started_at >= :since"),
            {"since": since},
        ).fetchall()

    logs     = [_row_to_dict(r) for r in rows]
    total    = len(logs)
    answered = sum(1 for l in logs if l.get("outcome") == "answered")
    missed   = sum(1 for l in logs if l.get("outcome") in ("missed", "no-answer"))
    avg_dur  = (
        round(sum(l["duration_secs"] for l in logs if l.get("duration_secs")) /
              max(1, sum(1 for l in logs if l.get("duration_secs"))))
        if any(l.get("duration_secs") for l in logs) else 0
    )

    return {
        "hours_back":        hours_back,
        "total":             total,
        "answered":          answered,
        "missed":            missed,
        "avg_duration_secs": avg_dur,
    }
