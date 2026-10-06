import json
import logging
import os
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models import trading as models
from app.engines import regime_engine, calibration_engine
from app.engines.ai_analyst import analyze_market_chart
from app.diagnostics import SESSION_ID

from app.services.candle_cache import (
    candle_cache_service,
    market_cache_adapter,
    compute_market_payload,
    _add_trade_markers,
    _series_value,
)

logger = logging.getLogger(__name__)

router = APIRouter()
market_cache = market_cache_adapter


def _to_float(value: Any, default: float = 0.0) -> float:
    if value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _iso_datetime(value):
    if value is None:
        return None
    return value.isoformat()


def _build_market_payload(symbol, interval, candles):
    return compute_market_payload(symbol, interval, candles)


@router.post("/mt5/candles")
def receive_mt5_candles(payload: dict):
    symbol = str(payload.get("symbol", "")).upper().strip()
    interval = str(payload.get("interval", "")).lower().strip()
    candles = payload.get("candles", [])
    if not symbol or interval not in {"1m", "5m", "15m", "1h", "4h", "1d"}:
        raise HTTPException(status_code=422, detail="Invalid symbol or interval")
    if not isinstance(candles, list) or len(candles) < 1:
        raise HTTPException(status_code=422, detail="Candles list cannot be empty")

    received_count, stored_count = candle_cache_service.upsert_candles(symbol, interval, candles)
    return {
        "success": True,
        "status": "accepted",
        "symbol": symbol,
        "interval": interval,
        "received": received_count,
        "stored": stored_count,
        "candles": received_count,
        "instance_id": SESSION_ID,
    }


@router.get("/market/chart")
def get_market_chart(symbol: str = "XAUUSDm", interval: str = "1h", limit: int = 500):
    """Proxy XAUUSD / XAUUSDm candles from in-memory candle cache or Python bridge."""
    symbol = symbol.strip()
    interval = interval.strip().lower()
    allowed_intervals = {"1m", "5m", "15m", "1h", "4h", "1d"}
    if not symbol.isalnum() or len(symbol) > 20:
        raise HTTPException(status_code=400, detail="Invalid market symbol")
    if interval not in allowed_intervals:
        raise HTTPException(status_code=400, detail="Unsupported interval")

    limit = max(1, min(limit, 1000))
    bridge_url = os.getenv("MT5_BRIDGE_URL", "").rstrip("/")
    if not bridge_url:
        try:
            return candle_cache_service.get_chart(symbol, interval, limit=limit)
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("Unexpected error while fetching chart for %s %s: %s", symbol, interval, exc)
            raise HTTPException(status_code=500, detail=f"Internal chart error: {exc}")

    bridge_query = urlencode({"symbol": symbol, "interval": interval, "limit": limit})
    try:
        with urlopen(f"{bridge_url}/chart?{bridge_query}", timeout=10) as response:
            payload = json.load(response)
    except (HTTPError, URLError, TimeoutError) as exc:
        raise HTTPException(status_code=502, detail="Could not reach the HFM MT5 bridge") from exc

    if not isinstance(payload, dict) or not isinstance(payload.get("candles"), list):
        raise HTTPException(status_code=502, detail="Invalid response from the HFM MT5 bridge")
    return _add_trade_markers(payload)

@router.get("/regime/{symbol}")
def get_regime(symbol: str, db: Session = Depends(get_db)):
    sym_upper = symbol.upper()
    
    # helper to find latest un-stale cache
    def get_df_from_cache(interval):
        entry = market_cache.get((sym_upper, interval))
        if not entry:
            for (cached_symbol, cached_interval), c_entry in market_cache.items():
                if cached_interval == interval:
                    c_upper = cached_symbol.upper()
                    if (
                        (sym_upper in {"XAUUSD", "XAUUSDM", "GOLD"} and c_upper in {"XAUUSD", "XAUUSDM", "GOLD"})
                        or c_upper.rstrip("M") == sym_upper.rstrip("M")
                        or ("XAU" in sym_upper and "XAU" in c_upper)
                        or ("GOLD" in sym_upper and "GOLD" in c_upper)
                    ):
                        entry = c_entry
                        break
        
        if entry:
            age = datetime.now(timezone.utc).timestamp() - entry["timestamp_received"]
            if age <= 3600: # We allow up to 1h old data for regime if no recent updates
                candles = entry["payload"].get("candles", [])
                if len(candles) >= 100:
                    return pd.DataFrame(candles)
        return pd.DataFrame(columns=["open", "high", "low", "close", "volume"])
        
    df_h4 = get_df_from_cache("4h")
    df_h1 = get_df_from_cache("1h")
    
    try:
        regime_data = regime_engine.get_latest(symbol, df_h4, df_h1)
        if regime_data.get("confidence_regime", 0) == 0.0 and regime_data.get("regime") == "RANGING" and len(df_h4) < 100:
            regime_data["regime"] = "NOT_ENOUGH_DATA"
        
        new_regime_log = models.RegimeHistory(
            symbol=symbol,
            timestamp=datetime.now(),
            regime=regime_data["regime"],
            regime_score=regime_data["regime_score"],
            volatility_state=regime_data["volatility_state"],
            adx_h4=regime_data["adx_h4"],
            adx_h1=regime_data["adx_h1"],
            bb_width_pct=regime_data["bb_width_percentile"],
            confidence_regime=regime_data["confidence_regime"]
        )
        db.add(new_regime_log)
        db.commit()
        db.refresh(new_regime_log)
        
        return {"symbol": symbol, "status": "success", "data": regime_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/confluence/{signal_id}")
def get_confluence(signal_id: int, db: Session = Depends(get_db)):
    confluence_record = db.query(models.ConfluenceScore).filter(models.ConfluenceScore.signal_id == signal_id).first()
    if not confluence_record:
        raise HTTPException(status_code=404, detail="Not found")
    return confluence_record

@router.get("/calibration/report")
def get_calibration_report(model_version: str = "", period: str = ""):
    mock_predictions = [
        {"confidence": 65, "outcome": 1},
        {"confidence": 75, "outcome": 1},
        {"confidence": 85, "outcome": 0}
    ]
    report: dict[str, Any] = dict(calibration_engine.generate_reliability_report(mock_predictions))
    report["model_version"] = model_version or "v1.0"
    return report

@router.get("/risk/events")
def get_risk_events(account_id: int | None = None, resolved: bool = False, db: Session = Depends(get_db)):
    query = db.query(models.RiskEvent).filter(models.RiskEvent.resolved == resolved)
    if account_id:
        query = query.filter(models.RiskEvent.trading_account_id == account_id)
    return query.all()

@router.post("/backtest/walk-forward")
def run_walk_forward(payload: dict):
    return {"status": "started", "task_id": "WF-12345", "split_ratio": payload.get("split_ratio", 0.6)}

@router.post("/backtest/monte-carlo")
def run_monte_carlo(payload: dict):
    return {"status": "started", "task_id": "MC-98765", "simulations": payload.get("n_simulations", 1000)}

@router.get("/trades/grading-summary")
def get_grading_summary(period: str = ""):
    return {
        "grade_A": 45,
        "grade_B": 30,
        "grade_C": 15,
        "grade_D": 10
    }


@router.get("/dashboard/summary")
def get_dashboard_summary(db: Session = Depends(get_db)):
    latest_regimes = (
        db.query(models.RegimeHistory)
        .order_by(models.RegimeHistory.timestamp.desc())
        .limit(6)
        .all()
    )
    open_signals = (
        db.query(models.Signal)
        .filter(func.lower(func.coalesce(models.Signal.status, "")) == "open")
        .order_by(models.Signal.id.desc())
        .limit(6)
        .all()
    )
    recent_risk_events = (
        db.query(models.RiskEvent)
        .order_by(models.RiskEvent.created_at.desc())
        .limit(6)
        .all()
    )
    latest_confluence = (
        db.query(models.ConfluenceScore)
        .order_by(models.ConfluenceScore.created_at.desc())
        .limit(6)
        .all()
    )

    signal_status_rows = (
        db.query(
            func.coalesce(models.Signal.status, "unknown").label("status"),
            func.count(models.Signal.id).label("count"),
        )
        .group_by("status")
        .all()
    )
    regime_rows = (
        db.query(
            func.coalesce(models.RegimeHistory.regime, "unknown").label("regime"),
            func.count(models.RegimeHistory.id).label("count"),
        )
        .group_by("regime")
        .all()
    )

    total_signals = db.query(func.count(models.Signal.id)).scalar() or 0
    open_signal_count = next(
        (row.count for row in signal_status_rows if str(row.status).lower() == "open"),
        0,
    )
    unresolved_risk_count = (
        db.query(func.count(models.RiskEvent.id))
        .filter(models.RiskEvent.resolved.is_(False))
        .scalar()
        or 0
    )
    latest_regime = latest_regimes[0] if latest_regimes else None
    avg_confluence = db.query(func.avg(models.ConfluenceScore.confluence_total)).scalar()
    high_confidence_count = (
        db.query(func.count(models.ConfluenceScore.id))
        .filter(models.ConfluenceScore.confluence_total >= 80)
        .scalar()
        or 0
    )

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "overview": {
            "total_signals": total_signals,
            "open_signals": open_signal_count,
            "risk_alerts": unresolved_risk_count,
            "average_confluence": round(_to_float(avg_confluence), 2),
            "high_confidence_signals": high_confidence_count,
            "latest_regime": latest_regime.regime if latest_regime else "No data",
        },
        "signal_status": [
            {"label": row.status, "value": row.count} for row in signal_status_rows
        ],
        "regime_distribution": [
            {"label": row.regime, "value": row.count} for row in regime_rows
        ],
        "latest_regimes": [
            {
                "symbol": item.symbol,
                "timestamp": _iso_datetime(item.timestamp),
                "regime": item.regime,
                "regime_score": round(_to_float(item.regime_score), 4),
                "volatility_state": item.volatility_state,
                "confidence_regime": round(_to_float(item.confidence_regime), 4),
            }
            for item in latest_regimes
        ],
        "open_signal_feed": [
            {
                "id": item.id,
                "symbol": item.symbol,
                "direction": item.direction,
                "entry": _to_float(item.entry),
                "stop_loss": _to_float(item.sl),
                "status": item.status,
            }
            for item in open_signals
        ],
        "risk_feed": [
            {
                "id": item.id,
                "account_id": item.trading_account_id,
                "event_type": item.event_type,
                "trigger_value": _to_float(item.trigger_value),
                "threshold_value": _to_float(item.threshold_value),
                "action_taken": item.action_taken,
                "resolved": item.resolved,
                "created_at": _iso_datetime(item.created_at),
            }
            for item in recent_risk_events
        ],
        "confluence_feed": [
            {
                "signal_id": item.signal_id,
                "total": round(_to_float(item.confluence_total), 2),
                "flag": item.confluence_flag,
                "trend_score": round(_to_float(item.trend_score), 2),
                "momentum_score": round(_to_float(item.momentum_score), 2),
                "created_at": _iso_datetime(item.created_at),
            }
            for item in latest_confluence
        ],
    }


@router.get("/ai/analyze")
def get_ai_analysis(
    symbol: str = "XAUUSDm",
    interval: str = "1h",
    agents: str = "all",
):
    symbol = symbol.strip()
    interval = interval.strip().lower()
    allowed_intervals = {"1m", "5m", "15m", "1h", "4h", "1d"}
    if not symbol.isalnum() or len(symbol) > 20:
        raise HTTPException(status_code=400, detail="Invalid market symbol")
    if interval not in allowed_intervals:
        raise HTTPException(status_code=400, detail="Unsupported interval")

    sym_upper = symbol.upper()
    cached_entry = market_cache.get((sym_upper, interval))
    if not cached_entry:
        for (cached_symbol, cached_interval), entry in market_cache.items():
            if cached_interval == interval:
                c_upper = cached_symbol.upper()
                if (
                    (sym_upper in {"XAUUSD", "XAUUSDM", "GOLD"} and c_upper in {"XAUUSD", "XAUUSDM", "GOLD"})
                    or c_upper.rstrip("M") == sym_upper.rstrip("M")
                    or ("XAU" in sym_upper and "XAU" in c_upper)
                    or ("GOLD" in sym_upper and "GOLD" in c_upper)
                ):
                    cached_entry = entry
                    break

    candles = cached_entry["payload"].get("candles", []) if cached_entry else []
    return analyze_market_chart(symbol, interval, candles, agents=agents)
