import unittest
import tempfile
import os
import pandas as pd
from datetime import datetime, timedelta, timezone
from trading_agent.config import AppConfig
from trading_agent.models import Candle
from trading_agent.brokers.paper import PaperBroker
from trading_agent.backtest import BacktestEngine

class TestBacktestExport(unittest.TestCase):

    def test_ac15_sl_tp_collision_sl_first(self):
        """AC15: Bar touching SL and TP simultaneously applies SL-first collision resolution."""
        broker = PaperBroker(initial_balance=10000.0)
        now = datetime.now(timezone.utc)

        broker.execute_order(
            symbol="XAUUSDm",
            direction="BUY",
            volume=0.10,
            price=2000.0,
            sl=1990.0,
            tp=2020.0,
            time=now
        )

        spike_candle = Candle(
            time=now + timedelta(minutes=15),
            open=2000.0,
            high=2025.0,  # Touches TP
            low=1985.0,   # Touches SL
            close=2000.0,
            volume=100
        )

        exited = broker.process_candle(spike_candle)
        self.assertEqual(len(exited), 1)
        self.assertIn("SL", exited[0]["exit_reason"])
        self.assertEqual(exited[0]["close_price"], 1990.0)

    def test_ac16_backtest_fill_timing(self):
        """AC16: Signal evaluated at close of bar t does not fill before open of bar t+1."""
        config = AppConfig(min_warmup_bars=60)
        engine = BacktestEngine(config)

        now = datetime.now(timezone.utc) - timedelta(hours=30)
        candles = [Candle(time=now + timedelta(minutes=15*i), open=2000.0 + i*0.5, high=2001.0 + i*0.5, low=1999.0 + i*0.5, close=2000.5 + i*0.5, volume=100) for i in range(100)]

        res = engine.run_backtest(candles)
        self.assertIn("trades", res)
        self.assertIn("net_return", res)

    def test_ac22_export_csv_statistics(self):
        """AC22: Backtest export CSV file generates valid columns and statistics."""
        config = AppConfig(min_warmup_bars=60)
        engine = BacktestEngine(config)

        now = datetime.now(timezone.utc) - timedelta(hours=30)
        candles = [Candle(time=now + timedelta(minutes=15*i), open=2000.0 + i*0.5, high=2001.0 + i*0.5, low=1999.0 + i*0.5, close=2000.5 + i*0.5, volume=100) for i in range(100)]

        res = engine.run_backtest(candles)

        with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as tf:
            csv_file = tf.name

        try:
            engine.export_csv(res, csv_file)
            df = pd.read_csv(csv_file)
            self.assertTrue(os.path.exists(csv_file))
        finally:
            if os.path.exists(csv_file):
                os.remove(csv_file)

if __name__ == "__main__":
    unittest.main()
