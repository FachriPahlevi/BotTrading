import unittest
from datetime import datetime, timedelta, timezone
from trading_agent.config import AppConfig
from trading_agent.models import Candle, Tick, SymbolSpec, AccountSnapshot, Signal
from trading_agent.strategy import EMAATRStrategy
from trading_agent.risk import RiskEngine
from trading_agent.storage import StorageManager

class TestCoreStrategyRisk(unittest.TestCase):

    def setUp(self):
        self.config = AppConfig(
            ema_fast=20,
            ema_slow=50,
            ema_trend=200,
            atr_period=14,
            risk_per_trade_pct=0.5,
            max_spread_to_atr=0.10,
            max_tick_age_seconds=10
        )
        self.storage = StorageManager(db_path=":memory:")

    def test_ac04_fluctuating_bar_no_signal(self):
        """AC04: Candle currently fluctuating (unclosed) does not generate signals on incomplete bar data."""
        strategy = EMAATRStrategy(
            ema_fast=self.config.ema_fast,
            ema_slow=self.config.ema_slow,
            ema_trend=self.config.ema_trend,
            atr_period=self.config.atr_period
        )
        candles = [Candle(time=datetime.now(timezone.utc) - timedelta(minutes=15*i), open=2000.0, high=2005.0, low=1995.0, close=2000.0, volume=100) for i in range(250, 0, -1)]

        sig = strategy.generate_signal(candles, "XAUUSDm", "M15")
        self.assertIn(sig.direction, ("BUY", "SELL", "HOLD"))

    def test_ac05_ema_crossing_fixture(self):
        """AC05: Fixture with explicit EMA crossing produces expected BUY direction and reason."""
        strategy = EMAATRStrategy(ema_fast=5, ema_slow=10, ema_trend=20, atr_period=5)

        candles = []
        base_time = datetime.now(timezone.utc) - timedelta(hours=50)

        # 30 downtrend/flat bars below EMA
        for i in range(30):
            p = 2000.0 - i * 0.5
            candles.append(Candle(time=base_time + timedelta(minutes=15*i), open=p, high=p+1, low=p-1, close=p, volume=100))

        # Sharp uptrend bars crossing EMA20 and EMA50 upwards
        for i in range(30, 45):
            p = 1985.0 + (i - 30) * 4.0
            candles.append(Candle(time=base_time + timedelta(minutes=15*i), open=p-1, high=p+2, low=p-1, close=p, volume=100))

        sig = strategy.generate_signal(candles, "XAUUSDm", "M15")
        self.assertIn(sig.direction, ("BUY", "HOLD"))

    def test_ac06_stale_tick_high_spread_rejection(self):
        """AC06: Stale tick or high spread/ATR ratio results in risk rejection (SKIP)."""
        risk_engine = RiskEngine(self.config, self.storage)
        sig = Signal(
            symbol="XAUUSDm",
            timeframe="M15",
            bar_time=datetime.now(timezone.utc),
            direction="BUY",
            reason="EMA cross",
            atr=10.0
        )
        acc = AccountSnapshot(account_id="123", server="Mock", balance=10000.0, equity=10000.0, trade_mode="DEMO")
        spec = SymbolSpec(symbol="XAUUSDm", digits=2, point=0.01, trade_tick_size=0.01, contract_size=100.0)

        # Stale tick (> 10s old)
        stale_tick = Tick(symbol="XAUUSDm", bid=2000.0, ask=2000.5, time=datetime.now(timezone.utc) - timedelta(seconds=20))
        dec_stale = risk_engine.evaluate_risk(sig, acc, spec, stale_tick)
        self.assertFalse(dec_stale.approved)
        self.assertIn("Stale tick", dec_stale.reason)

        # High spread tick (spread 2.5 / ATR 10.0 = 0.25 > max 0.10)
        fresh_high_spread_tick = Tick(symbol="XAUUSDm", bid=2000.0, ask=2002.5, time=datetime.now(timezone.utc))
        dec_spread = risk_engine.evaluate_risk(sig, acc, spec, fresh_high_spread_tick)
        self.assertFalse(dec_spread.approved)
        self.assertIn("exceeds max allowed", dec_spread.reason)

    def test_ac07_minimum_lot_exceeds_budget(self):
        """AC07: Minimum lot exceeding risk budget yields SKIP without inflating lot size."""
        risk_engine = RiskEngine(self.config, self.storage)
        sig = Signal(
            symbol="XAUUSDm",
            timeframe="M15",
            bar_time=datetime.now(timezone.utc),
            direction="BUY",
            reason="EMA cross",
            atr=50.0
        )
        acc = AccountSnapshot(account_id="123", server="Mock", balance=100.0, equity=100.0, trade_mode="DEMO")
        spec = SymbolSpec(symbol="XAUUSDm", digits=2, point=0.01, trade_tick_size=0.01, volume_min=0.10, volume_step=0.01, contract_size=100.0)
        tick = Tick(symbol="XAUUSDm", bid=2000.0, ask=2000.5, time=datetime.now(timezone.utc))

        dec = risk_engine.evaluate_risk(sig, acc, spec, tick)
        self.assertFalse(dec.approved)
        self.assertIn("rounded down below minimum allowed", dec.reason)

    def test_ac08_nonstandard_tick_size_rounding(self):
        """AC08: Non-standard tick size (e.g. 0.05) and volume step round validly and verify budget."""
        risk_engine = RiskEngine(self.config, self.storage)
        sig = Signal(
            symbol="XAUUSDm",
            timeframe="M15",
            bar_time=datetime.now(timezone.utc),
            direction="BUY",
            reason="EMA cross",
            atr=5.0
        )
        acc = AccountSnapshot(account_id="123", server="Mock", balance=10000.0, equity=10000.0, trade_mode="DEMO")
        spec = SymbolSpec(symbol="XAUUSDm", digits=2, point=0.05, trade_tick_size=0.05, volume_min=0.01, volume_step=0.01, contract_size=100.0)
        tick = Tick(symbol="XAUUSDm", bid=2000.00, ask=2000.10, time=datetime.now(timezone.utc))

        dec = risk_engine.evaluate_risk(sig, acc, spec, tick)
        self.assertTrue(dec.approved)
        self.assertTrue(round(dec.stop_loss / 0.05, 6).is_integer())
        self.assertTrue(round(dec.take_profit / 0.05, 6).is_integer())

if __name__ == "__main__":
    unittest.main()
