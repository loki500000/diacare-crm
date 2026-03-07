from fastapi import APIRouter
from database import get_db
from sqlalchemy import text

router = APIRouter(prefix="/api/settings", tags=["settings"])

SENSITIVE_KEYS = {"asterisk_ari_password", "clinic_password"}


@router.get("")
def get_settings():
    with get_db() as db:
        rows = db.execute(text("SELECT key, value FROM settings")).fetchall()
    result = {}
    for row in rows:
        key   = row.key
        value = row.value
        if key in SENSITIVE_KEYS and value:
            result[key] = "••••••••"
        else:
            result[key] = value
    return result


@router.put("")
def upsert_settings(body: dict):
    with get_db() as db:
        for k, v in body.items():
            if k in SENSITIVE_KEYS and v == "••••••••":
                continue
            db.execute(
                text("""
                    INSERT INTO settings (key, value)
                    VALUES (:key, :value)
                    ON CONFLICT (key) DO UPDATE
                    SET value = EXCLUDED.value, updated_at = now()
                """),
                {"key": k, "value": v},
            )
    return {"ok": True, "updated": list(body.keys())}
