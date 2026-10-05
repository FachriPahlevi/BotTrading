import os
import unittest

os.environ["TRADING_TEST_MODE"] = "1"

from fastapi import HTTPException
from app.api.trade import (
    submit_trade_order,
    get_orders_history,
    get_active_positions,
    close_position,
    OrderSubmitRequest,
    _orders_history,
    _active_positions,
)

class TestTradeExecution(unittest.TestCase):

    def setUp(self):
        _orders_history.clear()
        _active_positions.clear()

    def test_buy_order_validation_and_fill(self):
        # 1. Invalid action
        with self.assertRaises(HTTPException) as ctx:
            submit_trade_order(OrderSubmitRequest(symbol="XAUUSDm", action="HOLD", volume=0.01))
        self.assertEqual(ctx.exception.status_code, 400)

        # 2. Invalid Stop Loss for BUY (SL >= fill_price)
        with self.assertRaises(HTTPException) as ctx:
            submit_trade_order(OrderSubmitRequest(symbol="XAUUSDm", action="BUY", volume=0.01, sl=99999.0))
        self.assertEqual(ctx.exception.status_code, 400)

        # 3. Valid BUY order
        res = submit_trade_order(OrderSubmitRequest(symbol="XAUUSDm", action="BUY", volume=0.01, sl=2000.0, mode="paper", source="manual"))
        self.assertTrue(res.success)
        self.assertEqual(res.status, "FILLED")
        self.assertEqual(res.action, "BUY")
        self.assertIn(res.mode, {"paper", "demo", "TEST", "MT5 DEMO"})
        self.assertGreater(res.price, 2000.0)

    def test_sell_order_validation_and_fill(self):
        # 1. Invalid Stop Loss for SELL (SL <= fill_price)
        with self.assertRaises(HTTPException) as ctx:
            submit_trade_order(OrderSubmitRequest(symbol="XAUUSDm", action="SELL", volume=0.01, sl=100.0))
        self.assertEqual(ctx.exception.status_code, 400)

        # 2. Valid SELL order
        res = submit_trade_order(OrderSubmitRequest(symbol="XAUUSDm", action="SELL", volume=0.02, sl=3500.0, tp=2500.0, mode="paper", source="manual"))
        self.assertTrue(res.success)
        self.assertEqual(res.action, "SELL")
        self.assertEqual(res.volume, 0.02)

    def test_ai_order_execution(self):
        res = submit_trade_order(OrderSubmitRequest(
            symbol="XAUUSDm",
            action="BUY",
            volume=0.05,
            sl=2600.0,
            tp=2800.0,
            mode="paper",
            source="ai",
            comment="AI_RECOMMENDATION"
        ))
        self.assertTrue(res.success)
        self.assertEqual(res.source, "ai")
        self.assertEqual(res.action, "BUY")

    def test_get_orders_positions_and_close(self):
        # Submit an order
        res = submit_trade_order(OrderSubmitRequest(symbol="XAUUSDm", action="BUY", volume=0.01, mode="paper", source="manual"))
        ticket = res.ticket

        orders = get_orders_history()
        self.assertGreaterEqual(len(orders["orders"]), 1)

        positions = get_active_positions()
        self.assertGreaterEqual(len(positions["positions"]), 1)

        # Close position
        close_res = close_position(ticket)
        self.assertTrue(close_res["success"])
        self.assertEqual(len(get_active_positions()["positions"]), 0)

if __name__ == "__main__":
    unittest.main()
