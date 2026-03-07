from fastapi import APIRouter, HTTPException
from database import get_db
from sqlalchemy import text

router = APIRouter(prefix="/api/schedules", tags=["schedules"])


def _row_to_dict(row):
    return dict(row._mapping)


@router.get("")
def list_all_schedules(status: str = None):
    with get_db() as db:
        if status:
            rows = db.execute(
                text("""
                    SELECT cs.*,
                           p.name     AS patient_name,
                           p.initials AS patient_initials,
                           p.severity AS patient_severity
                    FROM call_schedules cs
                    LEFT JOIN patients p ON cs.patient_id = p.id
                    WHERE cs.status = :status
                    ORDER BY cs.scheduled_at
                """),
                {"status": status},
            ).fetchall()
        else:
            rows = db.execute(
                text("""
                    SELECT cs.*,
                           p.name     AS patient_name,
                           p.initials AS patient_initials,
                           p.severity AS patient_severity
                    FROM call_schedules cs
                    LEFT JOIN patients p ON cs.patient_id = p.id
                    ORDER BY cs.scheduled_at
                """)
            ).fetchall()

    result = []
    for r in rows:
        d = _row_to_dict(r)
        # Nest patient fields under "patients" key to match original API shape
        d["patients"] = {
            "name":     d.pop("patient_name", None),
            "initials": d.pop("patient_initials", None),
            "severity": d.pop("patient_severity", None),
        }
        result.append(d)
    return result


@router.put("/{schedule_id}")
def update_schedule(schedule_id: str, body: dict):
    if not body:
        raise HTTPException(status_code=400, detail="No fields to update")
    set_clause = ", ".join(f"{k} = :{k}" for k in body.keys())
    body["schedule_id"] = schedule_id
    with get_db() as db:
        row = db.execute(
            text(f"UPDATE call_schedules SET {set_clause} WHERE id = :schedule_id RETURNING *"),
            body,
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Schedule not found")
        return _row_to_dict(row)


@router.delete("/{schedule_id}")
def delete_schedule(schedule_id: str):
    with get_db() as db:
        db.execute(
            text("DELETE FROM call_schedules WHERE id = :id"),
            {"id": schedule_id},
        )
    return {"ok": True}
