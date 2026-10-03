import pandas as pd
from datetime import datetime, timezone
from typing import List, Optional
from trading_agent.models import Candle, Signal
from trading_agent.indicators import add_indicators

class EMAATRStrategy:
    def __init__(self, ema_fast: int = 20, ema_slow: int = 50, ema_trend: int = 200, atr_period: int = 14, strategy_version: str = "ema_atr_v1"):
        self.ema_fast = ema_fast
        self.ema_slow = ema_slow
        self.ema_trend = ema_trend
        self.atr_period = atr_period
        self.strategy_version = strategy_version

    def generate_signal(self, candles: List[Candle], symbol: str, timeframe: str) -> Signal:
        """Evaluate deterministic EMA Crossover strategy on closed bars."""
        if len(candles) < max(self.ema_trend, self.atr_period) + 2:
            return Signal(
                symbol=symbol,
                timeframe=timeframe,
                bar_time=candles[-1].time if candles else datetime.now(timezone.utc),
                strategy_version=self.strategy_version,
                direction="HOLD",
                reason="Insufficient bars for indicator warmup"
            )

        df = pd.DataFrame([c.model_dump() for c in candles])
        df = add_indicators(df, self.ema_fast, self.ema_slow, self.ema_trend, self.atr_period)

        row_t = df.iloc[-1]
        row_prev = df.iloc[-2]

        bar_time = row_t["time"]
        if not isinstance(bar_time, datetime):
            bar_time = datetime.fromtimestamp(bar_time / 1000.0, timezone.utc) if isinstance(bar_time, (int, float)) else pd.to_datetime(bar_time).to_pydatetime()

        ema_fast_prev = float(row_prev["ema_fast"])
        ema_slow_prev = float(row_prev["ema_slow"])
        ema_fast_curr = float(row_t["ema_fast"])
        ema_slow_curr = float(row_t["ema_slow"])
        ema_trend_curr = float(row_t["ema_trend"])
        close_curr = float(row_t["close"])
        atr_curr = float(row_t["atr"]) if pd.notna(row_t["atr"]) else 0.0

        # Deterministic strategy evaluation
        is_buy_cross = (ema_fast_prev <= ema_slow_prev) and (ema_fast_curr > ema_slow_curr)
        is_sell_cross = (ema_fast_prev >= ema_slow_prev) and (ema_fast_curr < ema_slow_curr)

        direction = "HOLD"
        reason = "No EMA crossover condition met"

        if is_buy_cross:
            if close_curr > ema_trend_curr:
                direction = "BUY"
                reason = f"EMA{self.ema_fast} crossed above EMA{self.ema_slow} and close ({close_curr}) > EMA{self.ema_trend} ({ema_trend_curr:.2f})"
            else:
                reason = f"EMA{self.ema_fast} crossed above EMA{self.ema_slow} but close ({close_curr}) <= EMA{self.ema_trend} ({ema_trend_curr:.2f})"
        elif is_sell_cross:
            if close_curr < ema_trend_curr:
                direction = "SELL"
                reason = f"EMA{self.ema_fast} crossed below EMA{self.ema_slow} and close ({close_curr}) < EMA{self.ema_trend} ({ema_trend_curr:.2f})"
            else:
                reason = f"EMA{self.ema_fast} crossed below EMA{self.ema_slow} but close ({close_curr}) >= EMA{self.ema_trend} ({ema_trend_curr:.2f})"

        return Signal(
            symbol=symbol,
            timeframe=timeframe,
            bar_time=bar_time,
            strategy_version=self.strategy_version,
            direction=direction,
            reason=reason,
            ema_fast=round(ema_fast_curr, 4),
            ema_slow=round(ema_slow_curr, 4),
            ema_trend=round(ema_trend_curr, 4),
            atr=round(atr_curr, 4)
        )
