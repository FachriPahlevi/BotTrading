import json
import os
from datetime import datetime
from decimal import Decimal
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

router = APIRouter()
market_cache = {}


def _to_float(value, default=0.0):
    if value is None:
        return default
    if isinstance(value, Decimal):
        return float(value)
    return value


def _iso_datetime(value):
    if value is None:
        return None
    return value.isoformat()


def _series_value(value):
    if pd.isna(value):
        return None
    return round(float(value), 6)


def _add_trade_markers(payload):
    """Mark MACD line crossovers so the chart can show historical trade cues."""
    candles = payload.get("candles", [])
    for index, candle in enumerate(candles):
        candle["trade_signal"] = None
        if index == 0:
            continue
        previous = candles[index - 1]
        values = (previous.get("macd"), previous.get("macd_signal"), candle.get("macd"), candle.get("macd_signal"))
        if not all(value is not None for value in values):
            continue
        previous_macd, previous_signal, macd, macd_signal = values
        if previous_macd <= previous_signal and macd > macd_signal:
            candle["trade_signal"] = "BUY"
        elif previous_macd >= previous_signal and macd < macd_signal:
            candle["trade_signal"] = "SELL"
    return payload


def _build_market_payload(symbol, interval, candles):
    frame = pd.DataFrame(candles)
    required = {"time", "open", "high", "low", "close"}
    if not required.issubset(frame.columns):
        raise HTTPException(status_code=422, detail="Candles must include time, open, high, low, and close")

    # Sort chronologically and drop duplicate timestamps
    frame = frame.sort_values("time").drop_duplicates(subset=["time"]).reset_index(drop=True)

    for column in ("open", "high", "low", "close", "volume"):
        if column not in frame:
            frame[column] = 0
        frame[column] = pd.to_numeric(frame[column])

    frame["sma_20"] = frame.close.rolling(20, min_periods=1).mean()
    frame["ema_50"] = frame.close.ewm(span=50, adjust=False).mean()
    standard_deviation = frame.close.rolling(20, min_periods=1).std(ddof=0).fillna(0)
    frame["bb_upper"] = frame.sma_20 + (standard_deviation * 2)
    frame["bb_lower"] = frame.sma_20 - (standard_deviation * 2)
    delta = frame.close.diff()
    gains = delta.clip(lower=0).ewm(alpha=1 / 14, adjust=False).mean()
    losses = (-delta.clip(upper=0)).ewm(alpha=1 / 14, adjust=False).mean()
    rs = gains / losses.replace(0, float("nan"))
    frame["rsi_14"] = 100 - (100 / (1 + rs))
    frame.loc[(losses == 0) & (gains > 0), "rsi_14"] = 100
    frame.loc[(losses == 0) & (gains == 0), "rsi_14"] = 50
    frame["rsi_14"] = frame["rsi_14"].fillna(50)
    frame["macd"] = frame.close.ewm(span=12, adjust=False).mean() - frame.close.ewm(span=26, adjust=False).mean()
    frame["macd_signal"] = frame.macd.ewm(span=9, adjust=False).mean()

    fields = ("time", "open", "high", "low", "close", "volume", "sma_20", "ema_50", "bb_upper", "bb_lower", "rsi_14", "macd", "macd_signal")
    normalized = []
    for item in frame.to_dict("records"):
        normalized.append({key: int(item[key]) if key == "time" else _series_value(item[key]) for key in fields})
    return _add_trade_markers({"symbol": symbol, "interval": interval, "provider": "HFM MetaTrader 5", "updated_at": datetime.utcnow().isoformat() + "Z", "candles": normalized})


@router.post("/mt5/candles")
def receive_mt5_candles(payload: dict):
    symbol = str(payload.get("symbol", "")).upper().strip()
    interval = str(payload.get("interval", "")).lower().strip()
    candles = payload.get("candles", [])
    if not symbol or interval not in {"1m", "5m", "15m", "1h", "4h", "1d"}:
        raise HTTPException(status_code=422, detail="Invalid symbol or interval")
    if not isinstance(candles, list) or len(candles) < 60:
        raise HTTPException(status_code=422, detail="At least 60 candles are required")
    market_cache[(symbol, interval)] = {
        "timestamp_received": datetime.utcnow().timestamp(),
        "payload": _build_market_payload(symbol, interval, candles[-500:])
    }
    return {"status": "accepted", "candles": len(candles), "instance_id": SESSION_ID}


@router.get("/market/chart")
def get_market_chart(symbol: str = "XAUUSDm", interval: str = "1h", limit: int = 160):
    """Proxy XAUUSD / XAUUSDm candles from a local bridge connected to MetaTrader 5."""
    symbol = symbol.strip()
    interval = interval.strip().lower()
    allowed_intervals = {"1m", "5m", "15m", "1h", "4h", "1d"}
    if not symbol.isalnum() or len(symbol) > 20:
        raise HTTPException(status_code=400, detail="Invalid market symbol")
    if interval not in allowed_intervals:
        raise HTTPException(status_code=400, detail="Unsupported interval")

    limit = max(60, min(limit, 500))
    bridge_url = os.getenv("MT5_BRIDGE_URL", "").rstrip("/")
    if not bridge_url:
        sym_upper = symbol.upper()
        # 1. Exact match (symbol & interval)
        cached_entry = market_cache.get((sym_upper, interval))

        # 2. Flexible symbol alias matching for exact interval
        if not cached_entry:
            for (cached_symbol, cached_interval), entry in market_cache.items():
                if cached_interval == interval:
                    c_upper = cached_symbol.upper()
                    if (
                        (sym_upper in {"XAUUSD", "XAUUSDM", "GOLD"} and c_upper in {"XAUUSD", "XAUUSDM", "GOLD"})
                        or c_upper.rstrip("M") == sym_upper.rstrip("M")
                    ):
                        cached_entry = entry
                        break

        if cached_entry:
            age = datetime.utcnow().timestamp() - cached_entry["timestamp_received"]
            if age <= 60:
                return cached_entry["payload"]
            else:
                detail = f"Cached data for {symbol} ({interval}) is stale ({int(age)}s old)."
                raise HTTPException(status_code=503, detail=detail)

        received_markets = [
            (cached_symbol, cached_interval,
             datetime.utcnow().timestamp() - entry["timestamp_received"])
            for (cached_symbol, cached_interval), entry in sorted(market_cache.items())
        ]
        detail = f"No MT5 candles received for {symbol} ({interval}) yet."
        if received_markets:
            market_summary = ", ".join(
                f"{cached_symbol} ({cached_interval}, {max(0, int(age))}s old)"
                for cached_symbol, cached_interval, age in received_markets
            )
            has_fresh = any(0 <= age <= 60 for _, _, age in received_markets)
            detail = (
                f"MT5 cache has {'fresh' if has_fresh else 'stale'} candles for {market_summary}, but not {symbol} ({interval}). "
                "Compile and attach AurumMarketBridge.mq5 v1.3, then check Experts/Log sistem for every timeframe."
            )
        raise HTTPException(
            status_code=503,
            detail=detail,
        )

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
                    if ((sym_upper in {"XAUUSD", "XAUUSDM", "GOLD"} and c_upper in {"XAUUSD", "XAUUSDM", "GOLD"})
                        or c_upper.rstrip("M") == sym_upper.rstrip("M")):
                        entry = c_entry
                        break
        
        if entry:
            age = datetime.utcnow().timestamp() - entry["timestamp_received"]
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
    report = calibration_engine.generate_reliability_report(mock_predictions)
    report["model_version"] = model_version or "v1.0"
    return report

@router.get("/risk/events")
def get_risk_events(account_id: int = None, resolved: bool = False, db: Session = Depends(get_db)):
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
        "generated_at": datetime.utcnow().isoformat() + "Z",
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
def get_ai_analysis(symbol: str = "XAUUSDm", interval: str = "1h"):
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
                ):
                    cached_entry = entry
                    break

    candles = cached_entry["payload"].get("candles", []) if cached_entry else []
    return analyze_market_chart(symbol, interval, candles)
