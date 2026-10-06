import math
from typing import Any


def _calculate_true_ranges(
    highs: list[float], lows: list[float], closes: list[float]
) -> list[float]:
    """Calculates True Range series for given OHLC series."""
    if len(highs) < 2 or len(lows) < 2 or len(closes) < 2:
        return []
    tr_list = []
    for i in range(1, len(highs)):
        h = highs[i]
        l = lows[i]
        prev_c = closes[i - 1]
        tr = max(h - l, abs(h - prev_c), abs(l - prev_c))
        tr_list.append(tr)
    return tr_list


def calculate_wilder_atr(
    highs: list[float], lows: list[float], closes: list[float], period: int = 14
) -> float | None:
    """Calculates Wilder's Smoothed Average True Range (ATR) ending at the last closed bar."""
    tr_list = _calculate_true_ranges(highs, lows, closes)
    if len(tr_list) < period:
        return None

    atr = sum(tr_list[:period]) / period
    for tr in tr_list[period:]:
        atr = (atr * (period - 1) + tr) / period

    return round(atr, 4) if math.isfinite(atr) else None


def calculate_ema(
    prices: list[float], period: int, min_warmup: int | None = None
) -> float | None:
    """Calculates Exponential Moving Average with explicit warm-up requirement."""
    warmup_req = min_warmup if min_warmup is not None else period
    if len(prices) < warmup_req:
        return None

    multiplier = 2.0 / (period + 1)
    ema = sum(prices[:period]) / period

    for price in prices[period:]:
        ema = (price - ema) * multiplier + ema

    return round(ema, 4) if math.isfinite(ema) else None


def calculate_rsi(closes: list[float], period: int = 14) -> float | None:
    """Calculates relative strength index using Wilder smoothing."""
    if len(closes) <= period:
        return None

    gains = []
    losses = []
    for i in range(1, len(closes)):
        diff = closes[i] - closes[i - 1]
        gains.append(max(0.0, diff))
        losses.append(max(0.0, -diff))

    if len(gains) < period:
        return None

    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period

    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period

    if avg_loss == 0.0:
        return 100.0 if avg_gain > 0 else 50.0

    rs = avg_gain / avg_loss
    rsi = 100.0 - (100.0 / (1.0 + rs))
    return round(rsi, 2) if math.isfinite(rsi) else None


def _is_valid_candle(c: dict[str, Any]) -> bool:
    """Checks if candle has finite positive close, high, and low."""
    return float(c.get("close") or 0) > 0 and float(c.get("high") or 0) > 0 and float(c.get("low") or 0) > 0


def _extract_ohlc_series(
    candles: list[dict[str, Any]]
) -> tuple[list[float], list[float], list[float]] | None:
    """Extracts validated closes, highs, and lows lists from raw candles."""
    if not candles or len(candles) < 5:
        return None

    valid = [c for c in candles if _is_valid_candle(c)]
    if len(valid) < 5:
        return None

    return (
        [float(c["close"]) for c in valid],
        [float(c["high"]) for c in valid],
        [float(c["low"]) for c in valid],
    )


def calculate_technical_metrics(candles: list[dict[str, Any]]) -> dict[str, Any]:
    """Calculates calibrated technical indicators from closed candles."""
    series = _extract_ohlc_series(candles)
    if not series:
        return {}
    closes, highs, lows = series

    last_close = closes[-1]
    swing_len = min(len(closes), 20)
    high_20 = round(max(highs[-swing_len:]), 4)
    low_20 = round(min(lows[-swing_len:]), 4)
    sma_20 = round(sum(closes[-swing_len:]) / swing_len, 4)

    atr = calculate_wilder_atr(highs, lows, closes, 14)
    if atr is None:
        atr = round(sum(highs[i] - lows[i] for i in range(len(highs))) / len(highs), 4)

    return {
        "last_close": last_close,
        "high_20": high_20,
        "low_20": low_20,
        "sma_20": sma_20,
        "ema_10": calculate_ema(closes, 10) or last_close,
        "ema_14": calculate_ema(closes, 14) or last_close,
        "ema_50": calculate_ema(closes, 50),
        "ema_200": calculate_ema(closes, 200, min_warmup=600),
        "atr": atr,
        "rsi_14": calculate_rsi(closes, 14),
        "bars_count": len(closes),
    }
