# This Source Code Form is subject to the Mozilla Public License, v. 2.0.
# https://mozilla.org/MPL/2.0/
# Original Pine indicator: Trend Target Ribbon [BOSWaves], © BOSWaves.
# Modified: Python numerical adaptation. Position drawings are reconstructed by
# the chart from flip/risk outputs; TradingView parity still requires fixtures.
import numpy as np
import pandas as pd
from trading_agent.indicators import calculate_atr
from trading_agent.lab_indicators import alma


def calculate_boswaves(frame, p):
    center = alma(frame.close, p['almaLen'], p['almaOffset'], p['almaSigma'])
    dev = frame.close.rolling(p['devLen']).std(ddof=0)
    atr = calculate_atr(frame.high, frame.low, frame.close, p['atrLen'])
    slope = (center-center.shift(p['slopeLen']))/atr.replace(0, np.nan)
    upper, lower = center+dev*p['devMult'], center-dev*p['devMult']
    up = ((slope > p['slopeMin']) & (frame.close > upper)).to_numpy()
    down = ((slope < -p['slopeMin']) & (frame.close < lower)).to_numpy()
    state = 0
    trends, buys, sells = [], [], []
    for bull, bear in zip(up, down):
        buy, sell = state != 1 and bull, state != -1 and bear
        if buy:
            state = 1
        elif sell:
            state = -1
        trends.append(float(state)); buys.append(float(buy)); sells.append(float(sell))
    trend = pd.Series(trends, index=frame.index)
    low = frame.low.rolling(p['stopLookback']).min().shift(1)
    high = frame.high.rolling(p['stopLookback']).max().shift(1)
    risk = (frame.close-low).where(trend == 1, high-frame.close)
    risk = risk.fillna(atr*p['minStopAtr']).clip(lower=atr*p['minStopAtr'], upper=atr*p['maxStopAtr'])
    levels = {name: np.full(len(frame), np.nan) for name in ('entry', 'stop', 'target1', 'target2', 'target3', 'target4')}
    active_entry = active_risk = np.nan
    active_direction = 0
    for index, (buy, sell) in enumerate(zip(buys, sells)):
        if buy or sell:
            active_entry = float(frame.close.iloc[index])
            active_risk = float(risk.iloc[index])
            active_direction = 1 if buy else -1
        if np.isfinite(active_entry) and np.isfinite(active_risk):
            levels['entry'][index] = active_entry
            levels['stop'][index] = active_entry-active_direction*active_risk
            for target in range(1, 5):
                levels[f'target{target}'][index] = active_entry+active_direction*active_risk*target
    distance = (frame.close-center).abs()/atr.replace(0, np.nan)
    conviction = (slope.abs()*2+distance*.35).clip(lower=0, upper=1).fillna(0)
    edge = center-dev*.55*trend
    mid = (center+edge)*.5
    flip = pd.Series(np.logical_or(buys, sells), index=frame.index)
    alma_draw = center.mask(flip)
    mid_draw = mid.mask(flip)
    edge_draw = edge.mask(flip)
    output = dict(alma=alma_draw, mid=mid_draw, edge=edge_draw, edge_glow=edge_draw.copy(),
                upper=upper, lower=lower, conviction=conviction, trend=trend,
                bull_flip=pd.Series(buys, index=frame.index), bear_flip=pd.Series(sells, index=frame.index), risk=risk)
    output.update({name: pd.Series(value,index=frame.index) for name,value in levels.items()})
    return output
