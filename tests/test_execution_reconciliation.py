import unittest
import tempfile
import os
from datetime import datetime, timezone
from trading_agent.config import AppConfig
from trading_agent.models import Candle, Tick, SymbolSpec, AccountSnapshot, Signal, RiskDecision, OrderIntent
from trading_agent.storage import StorageManager
from trading_agent.adapters.mock import MockAdapter
from trading_agent.execution import ExecutionStateMachine
from trading_agent.reconciliation import ReconciliationEngine
from trading_agent.engine import TradingEngineWorker, ProcessLockError

class TestExecutionReconciliation(unittest.TestCase):

    def setUp(self):
        self.storage = StorageManager(db_path=":memory:")

    def test_ac01_paper_mode_no_order_send(self):
        """AC01: Paper mode operates without MT5 and never invokes real order_send."""
        adapter = MockAdapter()
        sm = ExecutionStateMachine(self.storage)
        sig = Signal(symbol="XAUUSDm", timeframe="M15", bar_time=datetime.now(timezone.utc), direction="BUY", reason="Test")
        dec = RiskDecision(approved=True, direction="BUY", reason="OK", entry_price=2000.0, stop_loss=1990.0, take_profit=2020.0, volume=0.10)
        acc = adapter.account_snapshot()

        intent = sm.create_intent(sig, dec, acc)
        res_intent = sm.execute_intent(intent, adapter, mode="paper")

        self.assertEqual(res_intent.status, "FILLED")
        self.assertIsNotNone(res_intent.deal_ticket)

    def test_ac02_real_account_blocking(self):
        """AC02: REAL or CONTEST account in demo mode is rejected before order submission."""
        adapter = MockAdapter()
        sm = ExecutionStateMachine(self.storage, demo_armed=True)
        sig = Signal(symbol="XAUUSDm", timeframe="M15", bar_time=datetime.now(timezone.utc), direction="BUY", reason="Test")
        dec = RiskDecision(approved=True, direction="BUY", reason="OK", entry_price=2000.0, stop_loss=1990.0, take_profit=2020.0, volume=0.10)

        real_acc = AccountSnapshot(account_id="999999", server="Exness-Real", balance=10000.0, equity=10000.0, trade_mode="REAL")
        intent = sm.create_intent(sig, dec, real_acc)
        res_intent = sm.execute_intent(intent, adapter, mode="demo", account=real_acc)

        self.assertEqual(res_intent.status, "REJECTED")
        self.assertIn("REAL", res_intent.reject_reason)

    def test_ac10_idempotency_deduplication(self):
        """AC10: Same signal processed repeatedly yields single intent; duplicate is rejected."""
        sm = ExecutionStateMachine(self.storage)
        bar_time = datetime.now(timezone.utc)
        sig = Signal(symbol="XAUUSDm", timeframe="M15", bar_time=bar_time, direction="BUY", reason="Test")
        dec = RiskDecision(approved=True, direction="BUY", reason="OK", entry_price=2000.0, stop_loss=1990.0, take_profit=2020.0, volume=0.10)
        acc = AccountSnapshot(account_id="12345", server="Mock", balance=10000.0, equity=10000.0, trade_mode="DEMO")

        intent1 = sm.create_intent(sig, dec, acc)
        self.assertIsNotNone(intent1)

        intent2 = sm.create_intent(sig, dec, acc)
        self.assertIsNone(intent2)

    def test_ac11_timeout_unknown_reconciliation(self):
        """AC11: Order timeout sets UNKNOWN status, and reconciliation resolves deal without resubmitting."""
        adapter = MockAdapter()
        sm = ExecutionStateMachine(self.storage)
        bar_time = datetime.now(timezone.utc)
        sig = Signal(symbol="XAUUSDm", timeframe="M15", bar_time=bar_time, direction="BUY", reason="Test")
        dec = RiskDecision(approved=True, direction="BUY", reason="OK", entry_price=2000.0, stop_loss=1990.0, take_profit=2020.0, volume=0.10)
        acc = adapter.account_snapshot()

        intent = sm.create_intent(sig, dec, acc)
        self.storage.update_order_intent_status(intent.idempotency_key, "UNKNOWN", reject_reason="Broker timeout")

        reconciler = ReconciliationEngine(self.storage)
        rec_res = reconciler.reconcile_unknown_intents(adapter, "XAUUSDm")
        self.assertIn("reconciled", rec_res)

    def test_ac13_daily_loss_lock_persistence(self):
        """AC13: Daily loss limit lock persists in SQLite database."""
        self.storage.set_risk_lock("12345", "Exness-Mock", "DAILY_LOSS", "Breached 2% daily loss limit")
        locks = self.storage.get_active_risk_locks("12345", "Exness-Mock")
        self.assertEqual(len(locks), 1)
        self.assertEqual(locks[0]["lock_type"], "DAILY_LOSS")

    def test_ac17_dual_worker_prevention(self):
        """AC17: Second worker attempting startup raises ProcessLockError."""
        config = AppConfig()
        w1 = TradingEngineWorker(config)
        w2 = TradingEngineWorker(config)

        with tempfile.NamedTemporaryFile(delete=False) as tf:
            lock_file = tf.name

        try:
            w1.acquire_process_lock(lock_file)
            with self.assertRaises(ProcessLockError):
                w2.acquire_process_lock(lock_file)
            w1.release_process_lock()
        finally:
            if os.path.exists(lock_file):
                os.remove(lock_file)

    def test_ac24_linux_offline_import_without_mt5(self):
        """AC24: Core modules import cleanly on Linux without MetaTrader5 package."""
        from trading_agent.config import AppConfig
        from trading_agent.models import Candle
        from trading_agent.strategy import EMAATRStrategy
        from trading_agent.risk import RiskEngine
        from trading_agent.adapters.mock import MockAdapter

        config = AppConfig(data_source="mock")
        adapter = MockAdapter()
        self.assertTrue(adapter.connect())

if __name__ == "__main__":
    unittest.main()
