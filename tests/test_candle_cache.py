import threading
import unittest
from datetime import datetime, timezone
from fastapi import HTTPException

from app.api import endpoints
from app.services.candle_cache import candle_cache_service, MAX_CANDLE_HISTORY


def generate_candles(count: int, start_time: int = 1_700_000_000_000, step_ms: int = 60_000, base_price: float = 2000.0):
    return [
        {
            "time": start_time + i * step_ms,
            "open": base_price + i,
            "high": base_price + i + 2.0,
            "low": base_price + i - 1.0,
            "close": base_price + i + 1.5,
            "volume": 100 + i,
        }
        for i in range(count)
    ]


class CandleCacheTests(unittest.TestCase):
    def setUp(self):
        candle_cache_service.clear()

    def tearDown(self):
        candle_cache_service.clear()

    def test_initial_sync_and_response_format(self):
        """Initial sync sends 800 candles; POST returns success, received 800, stored 800."""
        raw_candles = generate_candles(800)
        payload = {
            "symbol": "XAUUSDm",
            "interval": "1h",
            "candles": raw_candles,
        }
        res = endpoints.receive_mt5_candles(payload)
        self.assertTrue(res["success"])
        self.assertEqual(res["status"], "accepted")
        self.assertEqual(res["symbol"], "XAUUSDM")
        self.assertEqual(res["interval"], "1h")
        self.assertEqual(res["received"], 800)
        self.assertEqual(res["stored"], 800)

    def test_incremental_sync_upsert_behavior(self):
        """Incremental sync sends 2 candles: 1 existing timestamp (update) + 1 new timestamp (insert)."""
        # Step 1: Initial sync 800
        initial_candles = generate_candles(800, start_time=1_000_000_000)
        endpoints.receive_mt5_candles({"symbol": "XAUUSDm", "interval": "1h", "candles": initial_candles})

        # Step 2: Incremental sync with 2 candles
        # Candle 1 has the same timestamp as bar 799 (last initial bar), but updated close
        last_initial_time = initial_candles[-1]["time"]
        updated_bar = {
            "time": last_initial_time,
            "open": 2799.0,
            "high": 2810.0,
            "low": 2795.0,
            "close": 2808.5,  # updated close
            "volume": 500,
        }
        new_bar = {
            "time": last_initial_time + 3600_000,
            "open": 2808.5,
            "high": 2820.0,
            "low": 2805.0,
            "close": 2815.0,
            "volume": 60,
        }
        incremental_payload = {
            "symbol": "XAUUSDm",
            "interval": "1h",
            "candles": [updated_bar, new_bar],
        }
        res = endpoints.receive_mt5_candles(incremental_payload)
        self.assertTrue(res["success"])
        self.assertEqual(res["received"], 2)
        # Because max history is 800, 800 existing + 1 new - 1 trimmed = 800
        self.assertEqual(res["stored"], 800)

        # Check chart endpoint
        chart = endpoints.get_market_chart("XAUUSDm", "1h", limit=500)
        candles = chart["candles"]
        self.assertEqual(len(candles), 500)
        # The very last candle must be the new bar
        self.assertEqual(candles[-1]["time"], new_bar["time"])
        self.assertEqual(candles[-1]["close"], 2815.0)
        # The second to last candle must be the updated bar
        self.assertEqual(candles[-2]["time"], updated_bar["time"])
        self.assertEqual(candles[-2]["close"], 2808.5)

    def test_max_800_retention_trimming(self):
        """Cache never stores more than 800 candles per symbol+interval."""
        big_candles = generate_candles(1000)
        endpoints.receive_mt5_candles({"symbol": "XAUUSDm", "interval": "15m", "candles": big_candles})

        chart = endpoints.get_market_chart("XAUUSDm", "15m", limit=1000)
        self.assertEqual(len(chart["candles"]), 800)
        # Oldest candle stored must be index 200 of initial 1000
        self.assertEqual(chart["candles"][0]["time"], big_candles[200]["time"])
        self.assertEqual(chart["candles"][-1]["time"], big_candles[999]["time"])

    def test_chart_limit_parameter_slicing(self):
        """GET /api/market/chart with limit=500 returns latest 500 of 800 stored."""
        candles_800 = generate_candles(800)
        endpoints.receive_mt5_candles({"symbol": "XAUUSDm", "interval": "5m", "candles": candles_800})

        chart = endpoints.get_market_chart("XAUUSDm", "5m", limit=500)
        self.assertEqual(len(chart["candles"]), 500)
        self.assertEqual(chart["candles"][0]["time"], candles_800[300]["time"])
        self.assertEqual(chart["candles"][-1]["time"], candles_800[799]["time"])

    def test_clear_error_when_no_data_available(self):
        """When no candles exist, clear 503 is returned with descriptive detail."""
        with self.assertRaises(HTTPException) as ctx:
            endpoints.get_market_chart("EURUSD", "1h")
        self.assertEqual(ctx.exception.status_code, 503)
        self.assertIn("No MT5 candle data available for EURUSD 1h", ctx.exception.detail)

    def test_concurrency_thread_safety(self):
        """Concurrent upserts and reads do not trigger race conditions or data corruption."""
        errors = []

        def worker_writer(tf: str):
            try:
                for i in range(20):
                    c = generate_candles(10, start_time=i * 600000)
                    endpoints.receive_mt5_candles({"symbol": "XAUUSDm", "interval": tf, "candles": c})
            except Exception as e:
                errors.append(e)

        def worker_reader(tf: str):
            try:
                for _ in range(20):
                    try:
                        endpoints.get_market_chart("XAUUSDm", tf, limit=50)
                    except HTTPException:
                        pass
            except Exception as e:
                errors.append(e)

        threads = []
        for tf in ("1m", "5m", "15m"):
            threads.append(threading.Thread(target=worker_writer, args=(tf,)))
            threads.append(threading.Thread(target=worker_reader, args=(tf,)))

        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertEqual(len(errors), 0, f"Encountered threading errors: {errors}")


if __name__ == "__main__":
    unittest.main()
