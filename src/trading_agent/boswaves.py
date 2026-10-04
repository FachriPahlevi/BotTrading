# This Source Code Form is subject to the Mozilla Public License, v. 2.0.
# https://mozilla.org/MPL/2.0/
# Original Pine indicator: Trend Target Ribbon [BOSWaves], © BOSWaves.
# Modified: Python numerical adaptation; excludes Pine drawing/position lifecycle.
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
    edge = center-dev*.55*trend
    return dict(alma=center, upper=upper, lower=lower, edge=edge, trend=trend,
                bull_flip=pd.Series(buys, index=frame.index), bear_flip=pd.Series(sells, index=frame.index), risk=risk)
