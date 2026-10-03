import hashlib
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from trading_agent.models import OrderIntent, Signal, RiskDecision, AccountSnapshot, BrokerResult
from trading_agent.storage import StorageManager
from trading_agent.adapters.base import BaseAdapter

class ExecutionStateMachine:
    """Order intent state machine enforcing idempotency, ARM guards, and transition recording."""

    def __init__(self, storage: StorageManager, demo_armed: bool = False):
        self.storage = storage
        self.demo_armed = demo_armed

    def calculate_idempotency_key(self, account_login: str, server: str, symbol: str, timeframe: str, bar_time: datetime, strategy_version: str, direction: str) -> str:
        raw_str = f"{account_login}_{server}_{symbol}_{timeframe}_{bar_time.isoformat()}_{strategy_version}_{direction}"
        return hashlib.sha256(raw_str.encode("utf-8")).hexdigest()

    def create_intent(
        self,
        signal: Signal,
        risk_decision: RiskDecision,
        account: AccountSnapshot
    ) -> Optional[OrderIntent]:
        if not risk_decision.approved:
            return None

        idempotency_key = self.calculate_idempotency_key(
            account_login=account.account_id,
            server=account.server,
            symbol=signal.symbol,
            timeframe=signal.timeframe,
            bar_time=signal.bar_time,
            strategy_version=signal.strategy_version,
            direction=signal.direction
        )

        intent = OrderIntent(
            idempotency_key=idempotency_key,
            account_login=account.account_id,
            server=account.server,
            symbol=signal.symbol,
            timeframe=signal.timeframe,
            bar_time=signal.bar_time,
            strategy_version=signal.strategy_version,
            direction=signal.direction,
            requested_volume=risk_decision.volume,
            entry_price=risk_decision.entry_price,
            stop_loss=risk_decision.stop_loss,
            take_profit=risk_decision.take_profit,
            status="CREATED"
        )

        success = self.storage.save_order_intent(intent)
        if not success:
            # Duplicate signal/bar intent already exists in SQLite (AC10)
            return None
        return intent

    def execute_intent(self, intent: OrderIntent, adapter: BaseAdapter, mode: str = "paper", account: Optional[AccountSnapshot] = None) -> OrderIntent:
        """Process intent from VALIDATED -> SUBMITTING -> FILLED / REJECTED / UNKNOWN."""

        # 1. Mode & Safety Verification
        if mode == "demo":
            if not self.demo_armed:
                reason = "DEMO mode is not armed by user session"
                self.storage.update_order_intent_status(intent.idempotency_key, "REJECTED", reject_reason=reason)
                intent.status = "REJECTED"
                intent.reject_reason = reason
                return intent

            acc = account or adapter.account_snapshot()
            if not acc.is_demo():
                reason = f"Account trade mode is {acc.trade_mode}, not DEMO. REAL/CONTEST accounts are strictly blocked."
                self.storage.update_order_intent_status(intent.idempotency_key, "REJECTED", reject_reason=reason)
                intent.status = "REJECTED"
                intent.reject_reason = reason
                return intent

        # 2. Mark status VALIDATED -> SUBMITTING before broker call (AC10)
        self.storage.update_order_intent_status(intent.idempotency_key, "SUBMITTING")
        intent.status = "SUBMITTING"

        # 3. Mode check: PAPER mode never calls order_send (AC01)
        if mode == "paper":
            res = adapter.submit_order(
                symbol=intent.symbol,
                action=intent.direction,
                volume=intent.requested_volume,
                price=intent.entry_price,
                sl=intent.stop_loss,
                tp=intent.take_profit,
                comment=f"PAPER_{intent.idempotency_key[:8]}"
            )
            self.storage.update_order_intent_status(
                intent.idempotency_key,
                "FILLED",
                deal_ticket=res.deal_ticket,
                order_ticket=res.order_ticket,
                filled_volume=res.filled_volume,
                filled_price=res.price
            )
            intent.status = "FILLED"
            intent.deal_ticket = res.deal_ticket
            intent.filled_volume = res.filled_volume
            intent.filled_price = res.price
            return intent

        # DEMO mode execution via MT5 adapter
        try:
            res = adapter.submit_order(
                symbol=intent.symbol,
                action=intent.direction,
                volume=intent.requested_volume,
                price=intent.entry_price,
                sl=intent.stop_loss,
                tp=intent.take_profit,
                comment=f"BOT_{intent.idempotency_key[:8]}"
            )
            if res.success:
                status = "FILLED" if res.filled_volume >= intent.requested_volume else "PARTIAL"
                self.storage.update_order_intent_status(
                    intent.idempotency_key,
                    status,
                    deal_ticket=res.deal_ticket,
                    order_ticket=res.order_ticket,
                    filled_volume=res.filled_volume,
                    filled_price=res.price
                )
                intent.status = status
                intent.deal_ticket = res.deal_ticket
                intent.filled_volume = res.filled_volume
                intent.filled_price = res.price
            else:
                self.storage.update_order_intent_status(intent.idempotency_key, "REJECTED", reject_reason=res.error_message)
                intent.status = "REJECTED"
                intent.reject_reason = res.error_message
        except Exception as ex:
            # Timeout / Error -> UNKNOWN (AC11)
            reason = f"Execution exception: {str(ex)}"
            self.storage.update_order_intent_status(intent.idempotency_key, "UNKNOWN", reject_reason=reason)
            intent.status = "UNKNOWN"
            intent.reject_reason = reason

        return intent
