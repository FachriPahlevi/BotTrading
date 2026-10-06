"""Research registry; parameters and warm-up drive both UI and calculation.

The BOSWaves adaptation is deliberately limited to numerical trend/stop outputs.
No Pine execution or claims of TradingView parity without reference fixtures.
"""
import math
from typing import Any, cast
import numpy as np
import pandas as pd
from trading_agent.indicators import calculate_ema, calculate_atr


def field(default, low, high, integer=False):
    return dict(default=default, min=low, max=high, type='integer' if integer else 'number')


LENGTH = field(20, 2, 2000, True)
REGISTRY = {
    'sma': dict(label='SMA', params={'period': LENGTH}, outputs=['value']),
    'ema': dict(label='EMA', params={'period': LENGTH}, outputs=['value']),
    'atr': dict(label='ATR (Wilder)', params={'period': field(14, 2, 500, True)}, outputs=['value']),
    'rsi': dict(label='RSI (Wilder)', params={'period': field(14, 2, 500, True)}, outputs=['value']),
    'bbands': dict(label='Bollinger Bands', params={'period': LENGTH, 'mult': field(2, .1, 10)}, outputs=['middle', 'upper', 'lower']),
    'alma': dict(label='ALMA', params={'period': field(34, 5, 2000, True), 'offset': field(.85, 0, 1), 'sigma': field(6, 1, 15)}, outputs=['value']),
    'boswaves_core': dict(label='BOSWaves — numerical adaptation (draft)', params={
        'almaLen': field(34, 5, 2000, True), 'almaOffset': field(.85, 0, 1), 'almaSigma': field(6, 1, 15),
        'devLen': field(34, 5, 2000, True), 'devMult': field(.65, .1, 3), 'slopeLen': field(3, 1, 10, True),
        'slopeMin': field(.08, 0, 1), 'atrLen': field(14, 5, 500, True), 'stopLookback': field(12, 3, 50, True),
        'minStopAtr': field(.75, .25, 3), 'maxStopAtr': field(3, 1, 8),
        'targetCount': field(4, 2, 4, True), 'zonePct': field(.06, .01, .25),
        'extendBars': field(30, 5, 200, True), 'keepPositions': field(4, 1, 12, True),
    }, outputs=['alma', 'mid', 'edge', 'edge_glow', 'upper', 'lower', 'conviction', 'trend', 'bull_flip', 'bear_flip', 'risk', 'entry', 'stop', 'target1', 'target2', 'target3', 'target4']),
}


def parameters(kind, supplied):
    if kind not in REGISTRY:
        raise ValueError('Jenis indikator tidak didukung.')
    schema = cast(dict[str, Any], REGISTRY[kind]['params'])
    if set(supplied)-set(schema):
        raise ValueError('Parameter indikator tidak dikenal.')
    result = {}
    for name, rule in schema.items():
        value = supplied.get(name, rule['default'])
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ValueError(f'{name}: harus angka finite.')
        if not rule['min'] <= value <= rule['max'] or (rule['type'] == 'integer' and int(value) != value):
            raise ValueError(f'{name}: di luar batas skema.')
        result[name] = int(value) if rule['type'] == 'integer' else float(value)
    if kind == 'boswaves_core' and result['minStopAtr'] > result['maxStopAtr']:
        raise ValueError('Minimum stop ATR tidak boleh melebihi maksimum.')
    return result


def warmup(kind, p):
    if kind == 'boswaves_core':
        return max(p['almaLen']+p['slopeLen'], p['devLen'], p['atrLen']*3, p['stopLookback']+1)
    return p['period']*(3 if kind in {'ema', 'rsi', 'atr'} else 1)+1


def alma(series, period, offset, sigma):
    weights = np.exp(-((np.arange(period)-offset*(period-1))**2)/(2*(period/sigma)**2))
    weights /= weights.sum()
    values = np.full(len(series), np.nan)
    if len(series) >= period:
        values[period-1:] = np.convolve(series.to_numpy(), weights[::-1], mode='valid')
    return pd.Series(values, index=series.index)


def wilder(series, period):
    data = series.to_numpy()
    values = np.full(len(data), np.nan)
    if len(data) <= period:
        return pd.Series(values, index=series.index)
    values[period] = np.mean(data[1:period+1])
    for i in range(period+1, len(data)):
        values[i] = (values[i-1]*(period-1)+data[i])/period
    return pd.Series(values, index=series.index)


def compute(frame: Any, kind: str, supplied: dict[str, Any]) -> dict[str, Any]:
    p = parameters(kind, supplied)
    period = int(p.get('period', 14))
    close = frame.close
    if kind == 'sma':
        out = {'value': close.rolling(period).mean()}
    elif kind == 'ema':
        out = {'value': calculate_ema(close, period)}
    elif kind == 'atr':
        out = {'value': calculate_atr(frame.high, frame.low, close, period)}
    elif kind == 'alma':
        out = {'value': alma(close, period, p['offset'], p['sigma'])}
    elif kind == 'bbands':
        middle = close.rolling(period).mean()
        dev = close.rolling(period).std(ddof=0)*p['mult']
        out = {'middle': middle, 'upper': middle+dev, 'lower': middle-dev}
    elif kind == 'rsi':
        diff = close.diff()
        gain, loss = wilder(diff.clip(lower=0), period), wilder(-diff.clip(upper=0), period)
        value = cast(pd.Series, 100-100/(1+gain/loss.replace(0, np.nan)))
        value[(loss == 0) & (gain > 0)] = 100
        value[(loss == 0) & (gain == 0)] = 50
        out = {'value': value}
    else:
        from trading_agent.boswaves import calculate_boswaves
        out = calculate_boswaves(frame, p)
    # Warm-up is a validity policy, not an assertion of exact percentage error.
    for value in out.values():
        cast(Any, value).iloc[:warmup(kind, p)-1] = np.nan
    return out
