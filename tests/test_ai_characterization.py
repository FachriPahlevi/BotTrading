import unittest
from app.engines.ai_analyst import analyze_market_chart

class TestAiCharacterization(unittest.TestCase):
    """Characterization tests to lock required frontend keys and response schema."""

    def test_frontend_required_keys_present_on_analysis(self):
        # 30 candle input
        candles = [
            {
                "time": 1700000000 + i * 3600,
                "open": 2000.0 + i,
                "high": 2005.0 + i,
                "low": 1995.0 + i,
                "close": 2002.0 + i,
                "volume": 100,
            }
            for i in range(30)
        ]
        res = analyze_market_chart("XAUUSDm", "1h", candles)

        required_root_keys = [
            "symbol",
            "interval",
            "bias",
            "confidence",
            "provider",
            "chart_overlays",
            "scenarios",
            "plans",
            "rationale",
        ]
        for key in required_root_keys:
            self.assertIn(key, res, f"Frontend requires root key: {key}")

        # Check scenarios.main structure
        if res.get("scenarios"):
            main_sc = res["scenarios"].get("main")
            if main_sc:
                self.assertIn("direction", main_sc)

        # Check plans structure if present
        if res.get("plans"):
            p0 = res["plans"][0]
            self.assertIn("id", p0)
            self.assertIn("direction", p0)

if __name__ == "__main__":
    unittest.main()
