"""Run this on the Windows machine where HFM MetaTrader 5 is already logged in."""

import os
from datetime import datetime, timezone

import MetaTrader5 as mt5
import pandas as pd
from fastapi import FastAPI, HTTPException

app = FastAPI(title="HFM MT5 Bridge")


@app.get("/account")
def account():
    terminal = mt5.terminal_info()
    info = mt5.account_info()
    positions = mt5.positions_get()
    if terminal is None or not terminal.connected or info is None or positions is None:
        raise HTTPException(503, "MT5 account or positions unavailable")
    # Read identity again to reject an account switch during collection.
    after = mt5.account_info()
    if after is None or (info.login, info.server) != (after.login, after.server):
        raise HTTPException(503, "MT5 account changed during read")
    modes = {mt5.ACCOUNT_TRADE_MODE_DEMO: "DEMO", mt5.ACCOUNT_TRADE_MODE_REAL: "REAL", mt5.ACCOUNT_TRADE_MODE_CONTEST: "CONTEST"}
    if info.trade_mode not in modes:
        raise HTTPException(503, "Unknown MT5 account type")
    return {
        "login": str(info.login), "name": info.name, "company": info.company,
        "server": info.server, "currency": info.currency,
        "trade_mode": modes[info.trade_mode], "leverage": info.leverage,
        "balance": info.balance, "equity": info.equity, "profit": info.profit,
        "credit": info.credit, "margin": info.margin, "margin_free": info.margin_free,
        "margin_level": info.margin_level if info.margin > 0 else None,
        "positions_count": len(positions), "connected": True,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

TIMEFRAMES = {
    "1m": mt5.TIMEFRAME_M1,
    "5m": mt5.TIMEFRAME_M5,
    "15m": mt5.TIMEFRAME_M15,
    "1h": mt5.TIMEFRAME_H1,
    "4h": mt5.TIMEFRAME_H4,
    "1d": mt5.TIMEFRAME_D1,
}


def value(item):
    return None if pd.isna(item) else round(float(item), 6)


@app.on_event("startup")
def connect_mt5():
    path = os.getenv("MT5_TERMINAL_PATH") or None
    if not mt5.initialize(path):
        raise RuntimeError(f"MT5 initialization failed: {mt5.last_error()}")


@app.on_event("shutdown")
def disconnect_mt5():
    mt5.shutdown()


@app.get("/chart")
def chart(symbol: str = "XAUUSDm", interval: str = "1h", limit: int = 160):
    symbol = symbol.strip()
    if interval not in TIMEFRAMES:
        raise HTTPException(status_code=400, detail="Unsupported interval")

    candidates = [symbol, symbol.upper(), symbol.lower()]
    if symbol.upper().startswith("XAUUSD"):
        candidates.extend(["XAUUSDm", "XAUUSDM", "XAUUSD", "GOLD"])

    selected = None
    for cand in candidates:
        if mt5.symbol_select(cand, True):
            selected = cand
            break

    if not selected:
        raise HTTPException(status_code=404, detail=f"Symbol {symbol} is unavailable in HFM MT5")

    rates = mt5.copy_rates_from_pos(selected, TIMEFRAMES[interval], 0, max(60, min(limit, 500)))
    if rates is None or len(rates) == 0:
        raise HTTPException(status_code=502, detail=f"No rates received: {mt5.last_error()}")

    frame = pd.DataFrame(rates)
    frame["sma_20"] = frame.close.rolling(20).mean()
    frame["ema_50"] = frame.close.ewm(span=50, adjust=False).mean()
    std = frame.close.rolling(20).std(ddof=0)
    frame["bb_upper"] = frame.sma_20 + (std * 2)
    frame["bb_lower"] = frame.sma_20 - (std * 2)
    delta = frame.close.diff()
    gains = delta.clip(lower=0).ewm(alpha=1 / 14, adjust=False).mean()
    losses = (-delta.clip(upper=0)).ewm(alpha=1 / 14, adjust=False).mean()
    frame["rsi_14"] = 100 - (100 / (1 + gains / losses.replace(0, float("nan"))))
    frame["macd"] = frame.close.ewm(span=12, adjust=False).mean() - frame.close.ewm(span=26, adjust=False).mean()
    frame["macd_signal"] = frame.macd.ewm(span=9, adjust=False).mean()

    keys = ("open", "high", "low", "close", "tick_volume", "sma_20", "ema_50", "bb_upper", "bb_lower", "rsi_14", "macd", "macd_signal")
    candles = [{
        "time": int(row.time) * 1000,
        "open": value(row.open), "high": value(row.high), "low": value(row.low), "close": value(row.close),
        "volume": value(row.tick_volume), "sma_20": value(row.sma_20), "ema_50": value(row.ema_50),
        "bb_upper": value(row.bb_upper), "bb_lower": value(row.bb_lower), "rsi_14": value(row.rsi_14),
        "macd": value(row.macd), "macd_signal": value(row.macd_signal),
    } for row in frame.itertuples()]
    return {"symbol": symbol, "interval": interval, "provider": "HFM MetaTrader 5", "updated_at": datetime.now(timezone.utc).isoformat(), "candles": candles}
