import unittest
from app.engines.ai_analyst import analyze_market_chart, calculate_technical_metrics

class TestAiAnalyst(unittest.TestCase):
    def test_calculate_technical_metrics_empty(self):
        metrics = calculate_technical_metrics([])
        self.assertEqual(metrics, {})

    def test_calculate_technical_metrics_valid(self):
        candles = []
        for i in range(30):
            candles.append({
                "time": 1700000000 + i * 3600,
                "open": 2000.0 + i,
                "high": 2005.0 + i,
                "low": 1995.0 + i,
                "close": 2002.0 + i,
                "volume": 100,
            })
        metrics = calculate_technical_metrics(candles)
        self.assertEqual(metrics["last_close"], 2031.0)
        self.assertGreater(metrics["high_20"], 2000)
        self.assertGreater(metrics["sma_20"], 0)
        self.assertGreater(metrics["ema_14"], 0)

    def test_analyze_market_chart_bullish(self):
        candles = []
        for i in range(30):
            candles.append({
                "time": 1700000000 + i * 3600,
                "open": 2000.0 + i,
                "high": 2005.0 + i,
                "low": 1995.0 + i,
                "close": 2002.0 + i,
                "volume": 100,
            })
        result = analyze_market_chart("XAUUSDm", "1h", candles)
        self.assertEqual(result["symbol"], "XAUUSDm")
        self.assertEqual(result["bias"], "LONG")
        self.assertGreaterEqual(result["confidence"], 70)
        self.assertIn("scenarios", result)
        self.assertIn("main", result["scenarios"])
        self.assertEqual(result["scenarios"]["main"]["direction"], "LONG")
        self.assertGreater(len(result["chart_overlays"]), 0)

if __name__ == "__main__":
    unittest.main()
