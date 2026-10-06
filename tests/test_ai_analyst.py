import json
import unittest
from pathlib import Path

from app.engines.agents.claude_agent import ClaudeAgent
from app.engines.agents.gemini_agent import GeminiAgent
from app.engines.agents.metrics import (
    calculate_technical_metrics,
    calculate_wilder_atr,
)
from app.engines.agents.models import AnalysisContext, PlanModel
from app.engines.agents.orchestrator import MultiAgentOrchestrator
from app.engines.agents.rule_based_agent import RuleBasedAgent
from app.engines.agents.validation import validate_agent_plan
from app.engines.ai_analyst import (
    analyze_market_chart,
)


class TestAiAnalystMultiAgent(unittest.TestCase):
    """Comprehensive test suite for honest AI multi-agent architecture."""

    def _generate_candles(self, count: int = 30, base_price: float = 2000.0, trend: float = 1.0) -> list[dict]:
        candles = []
        for i in range(count):
            c_open = base_price + (i * trend)
            c_close = c_open + trend * 0.5
            c_high = max(c_open, c_close) + 2.0
            c_low = min(c_open, c_close) - 2.0
            candles.append({
                "time": 1700000000 + i * 3600,
                "open": round(c_open, 2),
                "high": round(c_high, 2),
                "low": round(c_low, 2),
                "close": round(c_close, 2),
                "volume": 100,
            })
        return candles

    def test_1_insufficient_data_gold_returns_explicit_status(self):
        """1. Tanpa data (candle < 5): status='insufficient_data', tanpa data palsu."""
        res = analyze_market_chart("XAUUSDm", "1h", [])
        self.assertEqual(res["status"], "insufficient_data")
        self.assertEqual(res["bias"], "WAIT")
        self.assertEqual(res["confidence"], 0)
        self.assertFalse(res["tradable"])
        self.assertEqual(res["plans"], [])
        self.assertIsNone(res["visual_data"])
        self.assertIsNone(res["last_price"])

    def test_2_no_api_key_skips_llm_without_faking_results(self):
        """2. Tanpa API key: gemini dan claude skipped, tidak diganti rule_based, consensus null."""
        candles = self._generate_candles(30)
        # Instantiate agents with explicit None key and dummy client
        orch = MultiAgentOrchestrator({
            "gemini": GeminiAgent(api_key=""),
            "claude": ClaudeAgent(api_key=""),
            "rule_based": RuleBasedAgent(),
        })
        res = analyze_market_chart("XAUUSDm", "1h", candles, agents=["gemini", "claude", "rule_based"], orchestrator=orch)
        agent_res = res["agent_results"]

        self.assertEqual(agent_res["gemini"]["status"], "skipped")
        self.assertEqual(agent_res["gemini"]["error_code"], "no_key")
        self.assertEqual(agent_res["claude"]["status"], "skipped")
        self.assertEqual(agent_res["claude"]["error_code"], "no_key")
        self.assertEqual(agent_res["rule_based"]["status"], "ok")

        # Consensus must be null because ok agents count < 2
        self.assertIsNone(res["consensus"])

    def test_3_one_llm_failed_other_agents_continue(self):
        """3. Satu agent LLM failed: agent lain tetap jalan, hasil gagal tampil jujur."""
        candles = self._generate_candles(30)

        def mock_claude_500(url, headers, body, timeout):
            return 500, b'{"error": "Internal Server Error"}'

        def mock_gemini_ok(url, headers, body, timeout):
            data = {
                "bias": "LONG",
                "confidence": 85,
                "summary": "Analisis Gemini bullish.",
                "conclusion": "Momentum beli kuat.",
                "plan": {"direction": "BUY", "entry_min": 2030, "entry_max": 2030, "stop_loss": 2010, "take_profit_1": 2060},
            }
            resp = {"candidates": [{"content": {"parts": [{"text": json.dumps(data)}]}}]}
            return 200, json.dumps(resp).encode()

        orch = MultiAgentOrchestrator({
            "gemini": GeminiAgent(http_client=mock_gemini_ok, api_key="valid-key"),
            "claude": ClaudeAgent(http_client=mock_claude_500, api_key="valid-key"),
            "rule_based": RuleBasedAgent(),
        })
        res = analyze_market_chart("XAUUSDm", "1h", candles, agents=["gemini", "claude", "rule_based"], orchestrator=orch)
        agent_res = res["agent_results"]

        self.assertEqual(agent_res["claude"]["status"], "failed")
        self.assertEqual(agent_res["claude"]["error_code"], "http_5xx")
        self.assertEqual(agent_res["gemini"]["status"], "ok")
        self.assertEqual(agent_res["rule_based"]["status"], "ok")
        self.assertIsNotNone(res["consensus"])

    def test_4_two_agents_ok_with_different_bias_consensus(self):
        """4. Dua agent ok dengan arah berbeda: konsensus mencerminkan voting riil."""
        candles = self._generate_candles(30)

        def mock_gemini_short(url, headers, body, timeout):
            data = {"bias": "SHORT", "confidence": 75, "plan": {"direction": "SELL", "entry_min": 2030, "stop_loss": 2050, "take_profit_1": 2000}}
            resp = {"candidates": [{"content": {"parts": [{"text": json.dumps(data)}]}}]}
            return 200, json.dumps(resp).encode()

        orch = MultiAgentOrchestrator({
            "gemini": GeminiAgent(http_client=mock_gemini_short, api_key="key"),
            "rule_based": RuleBasedAgent(),  # Trending up will return LONG
        })
        res = analyze_market_chart("XAUUSDm", "1h", candles, agents=["gemini", "rule_based"], orchestrator=orch)
        consensus = res["consensus"]

        self.assertIsNotNone(consensus)
        self.assertEqual(consensus["total_agents"], 2)
        self.assertIn("votes", consensus)
        self.assertGreaterEqual(consensus["votes"]["SHORT"], 1)

    def test_5_plan_validation_sl_wrong_side(self):
        """5. Rencana LLM dengan SL di sisi salah: plan_valid=false dan not tradable."""
        plan_wrong = PlanModel(
            direction="BUY",
            entry_min=2000.0,
            entry_max=2000.0,
            stop_loss=2050.0,  # SL higher than entry for BUY is invalid!
            take_profit_1=2100.0,
        )
        valid, issues = validate_agent_plan(plan_wrong, 2000.0, {"atr": 10.0})
        self.assertFalse(valid)
        self.assertTrue(any("SL" in iss and "lebih rendah" in iss for iss in issues))

    def test_6_no_api_key_in_url_and_no_exception_leak(self):
        """6. Tidak ada kunci API di URL dan header auth digunakan."""
        recorded_urls = []
        recorded_headers = []

        def mock_recording_client(url, headers, body, timeout):
            recorded_urls.append(url)
            recorded_headers.append(headers)
            resp = {"candidates": [{"content": {"parts": [{"text": json.dumps({"bias": "WAIT"})}]}}]}
            return 200, json.dumps(resp).encode()

        agent = GeminiAgent(http_client=mock_recording_client, api_key="secret-gemini-key")
        context = AnalysisContext(
            symbol="EURUSD",
            interval="1H",
            now_utc="2026-10-06T00:00:00Z",
            current_price=1.0500,
            closed_candles=self._generate_candles(10, 1.0500),
            metrics={"last_close": 1.0500, "high_20": 1.0550, "low_20": 1.0450, "atr": 0.0050},
        )
        res = agent.analyze(context)

        self.assertEqual(res.status, "ok")
        self.assertTrue(len(recorded_urls) > 0)
        self.assertNotIn("key=", recorded_urls[0])
        self.assertEqual(recorded_headers[0].get("x-goog-api-key"), "secret-gemini-key")

    def test_7_metrics_calculation_wilder_atr_and_ema_warmup(self):
        """7. Metrik ATR Wilder dan EMA benar; EMA 200 null jika bar < 600."""
        candles = self._generate_candles(50, base_price=100.0, trend=1.0)
        metrics = calculate_technical_metrics(candles)

        self.assertIsNotNone(metrics["atr"])
        self.assertGreater(metrics["atr"], 0)
        self.assertIsNotNone(metrics["ema_10"])
        # EMA 200 requires >= 600 bars per CODE_QUALITY.md
        self.assertIsNone(metrics["ema_200"])

        # Manual known exact ATR verification: constant True Range of 3.0 across 25 bars
        highs = [10.0 + i + 2.0 for i in range(25)]
        lows = [10.0 + i - 1.0 for i in range(25)]
        closes = [10.0 + i for i in range(25)]
        atr = calculate_wilder_atr(highs, lows, closes, 14)
        self.assertIsNotNone(atr)
        self.assertEqual(atr, 3.0)

    def test_8_static_code_hygiene_no_gold_benchmark_or_fictional_text(self):
        """8. Test statis: tidak ada literal harga emas acuan, tanggal, atau narasi fiktif."""
        engines_dir = Path(__file__).resolve().parent.parent / "app" / "engines"
        forbidden_substrings = [
            "XAUUSD_BENCHMARK_CANDLES",
            "Snapshot Selasa, 6 Oktober 2026",
            "Investing.com",
            "Kevin Warsh",
            "4132.0",
            "4215.0",
            "4265.0",
        ]
        for py_file in engines_dir.rglob("*.py"):
            content = py_file.read_text(encoding="utf-8")
            for forbidden in forbidden_substrings:
                self.assertNotIn(
                    forbidden,
                    content,
                    f"Forbidden hardcoded benchmark '{forbidden}' found in {py_file.name}",
                )

    def test_9_confidence_is_calculated_and_not_constant(self):
        """9. Confidence dihitung dari pemenuhan kondisi nyata, bukan konstanta 84."""
        # Strong trend: passes multiple conditions
        candles_bull = self._generate_candles(40, base_price=2000.0, trend=2.0)
        res_bull = analyze_market_chart("XAUUSDm", "1h", candles_bull, agents=["rule_based"])

        # Flat sideways: passes fewer conditions
        candles_flat = [
            {"time": 1700000000 + i * 3600, "open": 2000.0, "high": 2001.0, "low": 1999.0, "close": 2000.0, "volume": 50}
            for i in range(40)
        ]
        res_flat = analyze_market_chart("XAUUSDm", "1h", candles_flat, agents=["rule_based"])

        self.assertIsInstance(res_bull["confidence"], int)
        self.assertIsInstance(res_flat["confidence"], int)
        self.assertNotEqual(res_bull["confidence"], 84)
        self.assertNotEqual(res_bull["confidence"], res_flat["confidence"])

    def test_10_cache_behavior_and_force_flag(self):
        """10. Cache bar yang sama tidak memanggil agent lagi; force=True memanggil ulang."""
        candles = self._generate_candles(30)
        call_count = [0]

        def counting_client(url, headers, body, timeout):
            call_count[0] += 1
            data = {"bias": "LONG", "confidence": 80, "plan": {"direction": "BUY", "entry_min": 2030, "stop_loss": 2010, "take_profit_1": 2050}}
            return 200, json.dumps({"candidates": [{"content": {"parts": [{"text": json.dumps(data)}]}}]}).encode()

        orch = MultiAgentOrchestrator({"gemini": GeminiAgent(http_client=counting_client, api_key="test-key")})

        # First call: cache miss
        analyze_market_chart("EURUSD", "1h", candles, agents=["gemini"], orchestrator=orch)
        self.assertEqual(call_count[0], 1)

        # Second call on same bar: cache hit
        analyze_market_chart("EURUSD", "1h", candles, agents=["gemini"], orchestrator=orch)
        self.assertEqual(call_count[0], 1)

        # Third call with force=True: bypass cache
        analyze_market_chart("EURUSD", "1h", candles, agents=["gemini"], orchestrator=orch, force=True)
        self.assertEqual(call_count[0], 2)

    def test_11_frontend_compatibility_contract(self):
        """11. Kompatibilitas: semua key yang dipakai frontend tetap ada."""
        candles = self._generate_candles(30)
        res = analyze_market_chart("XAUUSDm", "1h", candles, agents=["rule_based"])

        required_keys = [
            "symbol", "interval", "bias", "confidence", "status", "decision", "tradable",
            "provider", "provider_id", "provider_name", "last_price", "summary",
            "conclusion", "rationale", "technical", "plans", "scenarios", "chart_overlays",
            "visual_data", "key_resistance", "key_support", "multi_agent", "consensus",
            "selected_agents", "available_agents", "agent_results",
        ]
        for key in required_keys:
            self.assertIn(key, res, f"Missing required frontend key: {key}")

        self.assertIn("candles_sample", res["visual_data"])
        self.assertIn("main", res["scenarios"])
        self.assertTrue(len(res["plans"]) > 0)

    def test_12_millisecond_and_abnormal_timestamps_do_not_crash(self):
        """12. Timestamp ms epoch, ISO string, dan out-of-range tidak crash dengan OSError di Windows."""
        candles = self._generate_candles(30)
        # Ubah candle terakhir dengan timestamp milidetik
        candles[-1]["time"] = 1774843200000
        candles[-2]["time"] = "2026-03-01T15:00:00Z"
        candles[-3]["time"] = 999999999999999  # abnormal / overflow
        candles[-4]["time"] = None

        res = analyze_market_chart("XAUUSDm", "1h", candles, agents=["rule_based"])
        self.assertEqual(res["status"], "ok")
        self.assertIsNotNone(res["visual_data"])
        sample = res["visual_data"]["candles_sample"]
        self.assertEqual(len(sample), 25)
        # Pastikan label waktu terformat atau fallback string aman
        self.assertIsInstance(sample[-1][0], str)
        self.assertIsInstance(sample[-2][0], str)
        self.assertIsInstance(sample[-3][0], str)
        self.assertIsInstance(sample[-4][0], str)


if __name__ == "__main__":
    unittest.main()

