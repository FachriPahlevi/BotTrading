import unittest
from datetime import datetime

from fastapi import HTTPException

from app.api import endpoints


def candles(count=60):
    return [
        {"time": 1_700_000_000_000 + index * 60_000, "open": 100 + index,
         "high": 101 + index, "low": 99 + index, "close": 100.5 + index,
         "volume": 10}
        for index in range(count)
    ]


class MarketIngestTests(unittest.TestCase):
    def setUp(self):
        endpoints.market_cache.clear()

    def tearDown(self):
        endpoints.market_cache.clear()

    def test_all_supported_timeframes_are_accepted(self):
        for interval in ("1m", "5m", "15m", "1h", "4h", "1d"):
            result = endpoints.receive_mt5_candles({"symbol": "XAUUSDm", "interval": interval, "candles": candles()})
            self.assertEqual(result["status"], "accepted")
            self.assertEqual(result["instance_id"], endpoints.SESSION_ID)
        self.assertEqual(len(endpoints.market_cache), 6)

    def test_missing_timeframe_reports_stale_cache_truthfully(self):
        endpoints.receive_mt5_candles({"symbol": "XAUUSDm", "interval": "5m", "candles": candles()})
        endpoints.market_cache[("XAUUSDM", "5m")]["timestamp_received"] = datetime.utcnow().timestamp() - 61
        with self.assertRaises(HTTPException) as failure:
            endpoints.get_market_chart("XAUUSDm", "1h")
        self.assertEqual(failure.exception.status_code, 503)
        self.assertIn("stale candles", failure.exception.detail)
        self.assertIn("v1.3", failure.exception.detail)
        self.assertNotIn("currently arriving", failure.exception.detail)

    def test_fresh_matching_timeframe_returns_payload(self):
        endpoints.receive_mt5_candles({"symbol": "XAUUSDm", "interval": "1h", "candles": candles()})
        result = endpoints.get_market_chart("XAUUSDm", "1h")
        self.assertEqual(result["interval"], "1h")
        self.assertEqual(len(result["candles"]), 60)

    def test_chart_interval_is_case_insensitive(self):
        endpoints.receive_mt5_candles({"symbol": "XAUUSDm", "interval": "1h", "candles": candles()})
        result = endpoints.get_market_chart("XAUUSDm", "1H", 300)
        self.assertEqual(result["interval"], "1h")
        self.assertEqual(len(result["candles"]), 60)


if __name__ == '__main__':
    unittest.main()
