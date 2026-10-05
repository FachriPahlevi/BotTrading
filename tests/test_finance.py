import os
import unittest

os.environ["TRADING_TEST_MODE"] = "1"

from app.api.finance import get_finance_overview, get_pending_orders


class TestFinance(unittest.TestCase):
    def test_get_finance_overview_daily(self):
        res = get_finance_overview(period="daily")
        self.assertEqual(res["period"], "daily")
        self.assertIn("Harian", res["period_label"])
        self.assertIn("net_profit", res)
        self.assertIn("trades_count", res)
        self.assertIn("active_positions_count", res)
        self.assertIn("pending_orders_count", res)

    def test_get_finance_overview_all_periods(self):
        for p in ["daily", "weekly", "monthly", "yearly", "custom"]:
            res = get_finance_overview(period=p, start_date="2026-01-01", end_date="2026-10-05")
            self.assertEqual(res["period"], p)
            self.assertIsInstance(res["deals"], list)

    def test_get_pending_orders(self):
        res = get_pending_orders()
        self.assertIn("orders", res)
        self.assertIsInstance(res["orders"], list)


if __name__ == "__main__":
    unittest.main()
