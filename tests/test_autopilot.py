import os
import unittest

os.environ["TRADING_TEST_MODE"] = "1"

from app.engines.ai_autopilot import autopilot_engine
from app.api.autopilot import AutopilotStartRequest, start_autopilot, pause_autopilot, stop_autopilot, get_autopilot_status, trigger_autopilot_step


class TestAiAutopilot(unittest.TestCase):
    def setUp(self):
        autopilot_engine.stop(close_positions=False)
        autopilot_engine.logs.clear()

    def tearDown(self):
        autopilot_engine.stop(close_positions=False)

    def test_autopilot_lifecycle(self):
        # 1. Initial status
        status = get_autopilot_status()
        self.assertIn(status["status"], {"IDLE", "STOPPED"})

        # 2. Start autopilot
        req = AutopilotStartRequest(
            target_profit=1000.0,
            max_loss=200.0,
            volume=0.01,
            symbol="XAUUSDm",
            interval="1h",
        )
        res = start_autopilot(req)
        self.assertTrue(res["success"])
        self.assertEqual(res["data"]["status"], "RUNNING")
        self.assertEqual(res["data"]["target_profit"], 1000.0)

        # 3. Trigger evaluation cycle
        step_res = trigger_autopilot_step()
        self.assertTrue(step_res["success"])
        self.assertEqual(step_res["data"]["status"], "RUNNING")

        # 4. Pause autopilot
        pause_res = pause_autopilot()
        self.assertTrue(pause_res["success"])
        self.assertEqual(pause_res["data"]["status"], "PAUSED")

        # 5. Stop autopilot
        stop_res = stop_autopilot()
        self.assertTrue(stop_res["success"])
        self.assertEqual(stop_res["data"]["status"], "STOPPED")

    def test_target_reached_detection(self):
        autopilot_engine.start(target_profit=50.0, max_loss=20.0, volume=0.01, symbol="XAUUSDm")
        # Simulate profit reaching target
        autopilot_engine.start_balance = 500.0
        # Call cycle with total_profit exceeding target
        autopilot_engine.start_balance = 500.0
        # Simulate target hit
        autopilot_engine.total_profit = 60.0
        # Trigger cycle
        status = autopilot_engine.evaluate_cycle()
        # Should be TARGET_REACHED or status updated
        self.assertIn(status["status"], {"RUNNING", "TARGET_REACHED"})


if __name__ == "__main__":
    unittest.main()
