import unittest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.db.session import Base
from app.api.strategy_plans import (
    list_strategy_plans,
    create_strategy_plan,
    get_strategy_plan,
    delete_strategy_plan,
    StrategyPlanPayload,
)
from fastapi import HTTPException


class TestStrategyPlans(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

    def tearDown(self):
        self.db.close()

    def test_list_strategy_plans_seeds_default(self):
        res = list_strategy_plans(self.db)
        self.assertIsInstance(res, list)
        self.assertGreaterEqual(len(res), 1)
        first = res[0]
        self.assertIn("title", first)
        self.assertIn("payload", first)
        self.assertEqual(first["payload"]["symbol"], "XAUUSD")
        self.assertIn("plans", first["payload"])

    def test_create_and_delete_strategy_plan(self):
        payload_data = StrategyPlanPayload(
            title="EURUSD Bullish Continuation",
            symbol="EURUSD",
            interval="1h",
            bias="BULLISH",
            status="active",
            payload={
                "title": "EURUSD Bullish Continuation",
                "symbol": "EURUSD",
                "interval": "1h",
                "plans": [
                    {
                        "id": "plan_1",
                        "name": "Plan 1 - Dip Buy",
                        "direction": "BUY",
                        "entry": 1.0850,
                        "stop_loss": 1.0810,
                        "take_profit_1": 1.0920,
                        "rr_ratio": "1 : 1.75",
                        "is_main": True,
                    }
                ],
            },
        )
        created = create_strategy_plan(payload_data, self.db)
        self.assertEqual(created["title"], "EURUSD Bullish Continuation")
        created_id = created["id"]

        # Retrieve
        fetched = get_strategy_plan(created_id, self.db)
        self.assertEqual(fetched["id"], created_id)
        self.assertEqual(fetched["symbol"], "EURUSD")

        # Delete
        del_res = delete_strategy_plan(created_id, self.db)
        self.assertEqual(del_res["status"], "ok")

        # Confirm deleted
        with self.assertRaises(HTTPException):
            get_strategy_plan(created_id, self.db)


if __name__ == "__main__":
    unittest.main()
