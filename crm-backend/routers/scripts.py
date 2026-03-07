from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Any
from database import get_db
from sqlalchemy import text
from datetime import datetime
import json

router = APIRouter(prefix="/api/scripts", tags=["scripts"])


class ScriptCreate(BaseModel):
    name: str
    description: Optional[str] = None
    language: str = "Tamil"
    nodes: List[Any] = []
    edges: List[Any] = []
    is_default: bool = False


class ScriptUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    language: Optional[str] = None
    nodes: Optional[List[Any]] = None
    edges: Optional[List[Any]] = None
    is_default: Optional[bool] = None


def _row_to_dict(row):
    return dict(row._mapping)


@router.get("")
def list_scripts():
    with get_db() as db:
        rows = db.execute(
            text("SELECT * FROM call_scripts ORDER BY created_at DESC")
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


@router.post("")
def create_script(body: ScriptCreate):
    data = body.model_dump()
    data["nodes"] = json.dumps(data["nodes"])
    data["edges"] = json.dumps(data["edges"])
    cols = ", ".join(data.keys())
    placeholders = ", ".join(f":{k}" for k in data.keys())
    with get_db() as db:
        row = db.execute(
            text(f"INSERT INTO call_scripts ({cols}) VALUES ({placeholders}) RETURNING *"),
            data,
        ).fetchone()
        if not row:
            raise HTTPException(status_code=400, detail="Failed to create script")
        return _row_to_dict(row)


@router.get("/{script_id}")
def get_script(script_id: str):
    with get_db() as db:
        row = db.execute(
            text("SELECT * FROM call_scripts WHERE id = :id"),
            {"id": script_id},
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Script not found")
    return _row_to_dict(row)


@router.put("/{script_id}")
def update_script(script_id: str, body: ScriptUpdate):
    data = body.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    data["updated_at"] = datetime.utcnow().isoformat()
    for k in ("nodes", "edges"):
        if k in data and data[k] is not None:
            data[k] = json.dumps(data[k])
    set_clause = ", ".join(f"{k} = :{k}" for k in data.keys())
    data["script_id"] = script_id
    with get_db() as db:
        row = db.execute(
            text(f"UPDATE call_scripts SET {set_clause} WHERE id = :script_id RETURNING *"),
            data,
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Script not found")
        return _row_to_dict(row)


@router.delete("/{script_id}")
def delete_script(script_id: str):
    with get_db() as db:
        db.execute(
            text("DELETE FROM call_scripts WHERE id = :id"),
            {"id": script_id},
        )
    return {"ok": True}


@router.post("/{script_id}/set-default")
def set_default_script(script_id: str):
    with get_db() as db:
        db.execute(text("UPDATE call_scripts SET is_default = false WHERE is_default = true"))
        row = db.execute(
            text("UPDATE call_scripts SET is_default = true, updated_at = :ts WHERE id = :id RETURNING *"),
            {"ts": datetime.utcnow().isoformat(), "id": script_id},
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Script not found")
        return _row_to_dict(row)
