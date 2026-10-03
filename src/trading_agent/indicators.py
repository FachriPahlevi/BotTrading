import pandas as pd
import numpy as np

def calculate_ema(series: pd.Series, period: int) -> pd.Series:
    """Calculate EMA using pandas ewm(span=n, adjust=False)."""
    return series.ewm(span=period, adjust=False).mean()

def calculate_atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    """Calculate True Range and ATR with Wilder's smoothing seed."""
    prev_close = close.shift(1)
    tr1 = high - low
    tr2 = (high - prev_close).abs()
    tr3 = (low - prev_close).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)

    atr_vals = np.full(len(close), np.nan)
    if len(close) < period:
        return pd.Series(atr_vals, index=close.index)

    # Seed with SMA of first 'period' TR values
    tr_np = tr.to_numpy()
    first_sma = tr_np[:period].mean()
    atr_vals[period - 1] = first_sma

    for i in range(period, len(close)):
        atr_vals[i] = (atr_vals[i - 1] * (period - 1) + tr_np[i]) / period

    return pd.Series(atr_vals, index=close.index)

def add_indicators(df: pd.DataFrame, ema_fast: int = 20, ema_slow: int = 50, ema_trend: int = 200, atr_period: int = 14) -> pd.DataFrame:
    """Compute and attach EMA fast/slow/trend and ATR to candles DataFrame."""
    result = df.copy()
    result["ema_fast"] = calculate_ema(result["close"], ema_fast)
    result["ema_slow"] = calculate_ema(result["close"], ema_slow)
    result["ema_trend"] = calculate_ema(result["close"], ema_trend)
    result["atr"] = calculate_atr(result["high"], result["low"], result["close"], atr_period)
    return result
