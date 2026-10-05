import os
import time
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from trading_agent.config import AppConfig, load_config
from trading_agent.models import AccountSnapshot, SymbolSpec, Tick, Candle, Signal
from trading_agent.storage import StorageManager
from trading_agent.strategy import EMAATRStrategy
from trading_agent.risk import RiskEngine
from trading_agent.execution import ExecutionStateMachine
from trading_agent.reconciliation import ReconciliationEngine
from trading_agent.adapters.base import BaseAdapter
from trading_agent.adapters.mock import MockAdapter
from trading_agent.adapters.mt5 import MT5Adapter

class ProcessLockError(Exception):
    pass

class TradingEngineWorker:
    """Worker process managing polling, strategy signals, risk evaluation, and single-worker file lock."""

    def __init__(self, config: AppConfig, adapter: Optional[BaseAdapter] = None):
        self.config = config
        self.storage = StorageManager(db_path=config.db_path)
        self.data_adapter = adapter or (MT5Adapter() if config.data_source == "mt5" else MockAdapter(initial_balance=config.paper_initial_balance, symbol=config.symbol or config.reference_symbol))
        
        if config.mode == "paper":
            self.execution_adapter = MockAdapter(initial_balance=config.paper_initial_balance, symbol=config.symbol or config.reference_symbol)
        else:
            self.execution_adapter = self.data_adapter
        self.strategy = EMAATRStrategy(
            ema_fast=config.ema_fast,
            ema_slow=config.ema_slow,
            ema_trend=config.ema_trend,
            atr_period=config.atr_period,
            strategy_version=config.strategy_version
        )
        self.risk_engine = RiskEngine(config, self.storage)
        self.execution_sm = ExecutionStateMachine(self.storage)
        self.reconciliation = ReconciliationEngine(self.storage)
        self.state = "PAUSED"  # PAPER, DEMO, PAUSED, ERROR
        self.last_seen_bar_time: Optional[datetime] = None
        self._lock_file = None

    def acquire_process_lock(self, lock_path: str = "trading_agent.lock"):
        """Acquire single-worker process lock to prevent dual worker execution (AC17)."""
        try:
            self._lock_file = open(lock_path, "w")
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(self._lock_file.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(self._lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self._lock_file.write(str(os.getpid()))
            self._lock_file.flush()
        except (IOError, OSError) as e:
            if self._lock_file:
                try:
                    self._lock_file.close()
                except Exception:
                    pass
                self._lock_file = None
            raise ProcessLockError(f"Another trading worker process is already running: {e}")

    def release_process_lock(self):
        if self._lock_file:
            try:
                if os.name == 'nt':
                    import msvcrt
                    self._lock_file.seek(0)
                    msvcrt.locking(self._lock_file.fileno(), msvcrt.LK_UNLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(self._lock_file, fcntl.LOCK_UN)
                self._lock_file.close()
            except Exception:
                pass
            self._lock_file = None

    def initialize(self) -> bool:
        if not self.data_adapter.is_connected():
            if not self.data_adapter.connect():
                self.state = "ERROR"
                return False

        # Account check
        acc = self.data_adapter.account_snapshot()
        if self.config.mode == "demo" and not acc.is_demo():
            self.state = "ERROR"
            raise PermissionError(f"REAL/CONTEST accounts are blocked: {acc.trade_mode}")

        # Symbol check
        symbol = self.config.symbol or self.config.reference_symbol
        spec = self.data_adapter.symbol_info(symbol)

        # Run startup reconciliation
        rec_res = self.reconciliation.reconcile_unknown_intents(self.data_adapter, symbol)
        if rec_res["requires_pause"]:
            self.state = "PAUSED"
        else:
            self.state = "PAPER" if self.config.mode == "paper" else ("DEMO" if self.execution_sm.demo_armed else "PAUSED")

        # Mark last seen bar to prevent historical signal execution on restart (AC21)
        bars = self.data_adapter.closed_bars(symbol, self.config.timeframe, count=self.config.min_warmup_bars)
        if bars:
            self.last_seen_bar_time = bars[-1].time

        return True

    def arm_demo_session(self, arm: bool = True):
        """Arm or disarm DEMO execution state for current user session."""
        if arm:
            symbol = self.config.symbol or self.config.reference_symbol
            rec_res = self.reconciliation.reconcile_unknown_intents(self.data_adapter, symbol)
            if rec_res["requires_pause"]:
                self.state = "PAUSED"
                self.execution_sm.demo_armed = False
                raise PermissionError("Cannot ARM DEMO while there are unresolved order intents.")

            acc = self.data_adapter.account_snapshot()
            if not acc.is_demo():
                raise PermissionError("Cannot ARM DEMO on REAL/CONTEST account")
            self.execution_sm.demo_armed = True
            if self.config.mode == "demo":
                self.state = "DEMO"
        else:
            self.execution_sm.demo_armed = False
            self.state = "PAUSED"

    def step(self) -> Dict[str, Any]:
        """Perform a single iteration step of polling, signal evaluation, and risk check."""
        symbol = self.config.symbol or self.config.reference_symbol

        # 1. Fetch snapshot and record equity
        acc = self.data_adapter.account_snapshot()
        self.storage.record_equity_snapshot(acc)

        if self.state in ("PAUSED", "ERROR"):
            return {"status": self.state, "reason": "Engine is paused or in error state"}

        # 2. Fetch bars and check bar closure
        bars = self.data_adapter.closed_bars(symbol, self.config.timeframe, count=self.config.min_warmup_bars + 10)
        if len(bars) < self.config.min_warmup_bars:
            return {"status": "WARMUP", "reason": f"Bars ({len(bars)}) < min_warmup_bars ({self.config.min_warmup_bars})"}

        latest_bar = bars[-1]

        # Evaluate signal ONLY on newly closed bar (AC04, AC21)
        if self.last_seen_bar_time is not None and latest_bar.time <= self.last_seen_bar_time:
            return {"status": "WAITING_BAR", "last_bar_time": self.last_seen_bar_time.isoformat()}

        self.last_seen_bar_time = latest_bar.time

        # 3. Strategy evaluation
        signal = self.strategy.generate_signal(bars, symbol, self.config.timeframe)
        self.storage.save_signal(signal)

        if signal.direction == "HOLD":
            return {"status": "HOLD", "reason": signal.reason}

        # 4. Tick & Symbol spec fetch for risk check
        tick = self.data_adapter.latest_tick(symbol)
        spec = self.data_adapter.symbol_info(symbol)
        open_positions = self.data_adapter.open_positions(symbol)

        # 5. Risk evaluation
        risk_decision = self.risk_engine.evaluate_risk(
            signal=signal,
            account=acc,
            symbol_spec=spec,
            tick=tick,
            open_positions_count=len(open_positions)
        )

        if not risk_decision.approved:
            return {"status": "RISK_REJECTED", "reason": risk_decision.reason}

        # 6. Intent creation & state machine execution
        intent = self.execution_sm.create_intent(signal, risk_decision, acc)
        if intent is None:
            return {"status": "DUPLICATE_INTENT", "reason": "Intent for bar already exists in ledger"}

        result_intent = self.execution_sm.execute_intent(intent, self.execution_adapter, mode=self.config.mode)
        return {
            "status": result_intent.status,
            "intent_id": result_intent.idempotency_key,
            "direction": result_intent.direction,
            "volume": result_intent.requested_volume,
            "price": result_intent.entry_price
        }

    def shutdown(self):
        self.release_process_lock()
        if self.data_adapter:
            self.data_adapter.disconnect()
        if self.execution_adapter and self.execution_adapter != self.data_adapter:
            self.execution_adapter.disconnect()
