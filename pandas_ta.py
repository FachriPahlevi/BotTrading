import numpy as np
import pandas as pd


def _as_series(values, name):
    s = pd.Series(values, name=name)
    return s


def adx(high, low, close, length=14):
    high = pd.Series(high)
    low = pd.Series(low)
    close = pd.Series(close)

    up_move = high.diff()
    down_move = low.diff() * -1
    plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
    minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)

    plus_dm = pd.Series(plus_dm, index=high.index, name="DMP")
    minus_dm = pd.Series(minus_dm, index=high.index, name="DMN")

    tr1 = high - low
    tr2 = (high - close.shift(1)).abs()
    tr3 = (low - close.shift(1)).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)

    plus_di = 100 * (plus_dm.ewm(alpha=1 / length, adjust=False).mean() / tr.ewm(alpha=1 / length, adjust=False).mean())
    minus_di = 100 * (minus_dm.ewm(alpha=1 / length, adjust=False).mean() / tr.ewm(alpha=1 / length, adjust=False).mean())

    dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan)
    adx = dx.ewm(alpha=1 / length, adjust=False).mean()

    result = pd.DataFrame({
        "DMP_14": plus_di,
        "DMN_14": minus_di,
        "ADX_14": adx,
    })
    return result


def atr(high, low, close, length=14):
    high = pd.Series(high)
    low = pd.Series(low)
    close = pd.Series(close)

    tr1 = high - low
    tr2 = (high - close.shift(1)).abs()
    tr3 = (low - close.shift(1)).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    atr = tr.ewm(alpha=1 / length, adjust=False).mean()
    result = pd.DataFrame({"ATR_14": atr})
    return result


def bbands(close, length=20, std=2):
    close = pd.Series(close)
    rolling = close.rolling(window=length)
    middle = rolling.mean()
    std_dev = rolling.std(ddof=0)
    lower = middle - (std_dev * std)
    upper = middle + (std_dev * std)

    result = pd.DataFrame({
        "BBL_20_2.0": lower,
        "BBM_20_2.0": middle,
        "BBU_20_2.0": upper,
    })
    return result
