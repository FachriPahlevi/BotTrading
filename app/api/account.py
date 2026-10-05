"""Read-only terminal account snapshots. Independent of trading execution."""

import json
import os
from datetime import datetime, timezone
from typing import Literal
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

from fastapi import APIRouter, HTTPException, Response
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, ValidationError

from app.diagnostics import SESSION_ID

router = APIRouter()


class TerminalAccount(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False, extra="forbid")

    login: str = Field(pattern=r"^[0-9]{1,20}$")
    name: str = Field(min_length=1, max_length=200)
    company: str = Field(min_length=1, max_length=200)
    server: str = Field(min_length=1, max_length=200)
    currency: str = Field(min_length=1, max_length=12)
    trade_mode: Literal["DEMO", "REAL", "CONTEST"]
    leverage: int = Field(gt=0, strict=True)
    balance: float
    equity: float
    profit: float
    credit: float
    margin: float = Field(ge=0)
    margin_free: float
    margin_level: float | None = Field(default=None, ge=0)
    positions_count: int = Field(ge=0, strict=True)
    connected: bool = Field(strict=True)
    updated_at: AwareDatetime


account_cache: TerminalAccount | None = None


def require_fresh(snapshot: TerminalAccount):
    age = (datetime.now(timezone.utc) - snapshot.updated_at).total_seconds()
    if not snapshot.connected:
        raise HTTPException(503, "Terminal MT5 terputus. Data akun tidak tersedia.")
    if age > 60 or age < -10:
        raise HTTPException(503, "Data akun MT5 kedaluwarsa atau waktu terminal tidak sesuai.")
    return snapshot


@router.post("/mt5/account")
def receive_account(payload: TerminalAccount):
    global account_cache
    # Invalidate the old account even when the latest report is disconnected/stale.
    account_cache = None
    require_fresh(payload)
    account_cache = payload
    return {"status": "accepted", "instance_id": SESSION_ID}


@router.get("/account", response_model=TerminalAccount)
def get_account(response: Response):
    response.headers["Cache-Control"] = "no-store"
    bridge_url = os.getenv("MT5_BRIDGE_URL", "").rstrip("/")
    if bridge_url:
        try:
            with urlopen(f"{bridge_url}/account", timeout=8) as upstream:
                snapshot = TerminalAccount.model_validate(json.load(upstream))
        except (HTTPError, URLError, TimeoutError, ValueError, ValidationError) as exc:
            raise HTTPException(503, "Data akun gagal dibaca dari bridge MT5.") from exc
        return require_fresh(snapshot)
    if account_cache is None:
        raise HTTPException(503, "Belum ada data akun MT5. Perbarui dan pasang AurumMarketBridge v1.3 di terminal.")
    return require_fresh(account_cache)

