from datetime import datetime, timezone
from typing import List, Optional
from trading_agent.config import AppConfig
from trading_agent.models import AccountSnapshot, SymbolSpec, Tick, Signal, RiskDecision, round_price, round_down_volume
from trading_agent.storage import StorageManager

class RiskEngine:
    def __init__(self, config: AppConfig, storage: StorageManager):
        self.config = config
        self.storage = storage

    def evaluate_risk(
        self,
        signal: Signal,
        account: AccountSnapshot,
        symbol_spec: SymbolSpec,
        tick: Tick,
        open_positions_count: int = 0,
        pending_intents_count: int = 0
    ) -> RiskDecision:
        """Evaluate pre-order risk constraints and calculate exact lot size, SL, and TP."""

        # 1. Signal Direction & Stale Tick Guard
        if signal.direction == "HOLD":
            return RiskDecision(approved=False, direction="HOLD", reason="Signal direction is HOLD")

        tick_age = (datetime.now(timezone.utc) - tick.time).total_seconds()
        if tick_age > self.config.max_tick_age_seconds:
            return RiskDecision(
                approved=False,
                direction=signal.direction,
                reason=f"Stale tick received ({tick_age:.1f}s old > max {self.config.max_tick_age_seconds}s)"
            )

        # 2. Daily Loss and Drawdown Lock Guards
        date_utc = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        baselines = self.storage.get_or_create_risk_baseline(account.account_id, account.server, account.equity, date_utc)
        e0 = baselines["e0_baseline"]
        hwm = baselines["high_water_mark"]

        daily_loss_pct = max(0.0, (e0 - account.equity) / e0 * 100.0) if e0 > 0 else 0.0
        drawdown_pct = max(0.0, (hwm - account.equity) / hwm * 100.0) if hwm > 0 else 0.0

        if daily_loss_pct >= self.config.daily_loss_limit_pct:
            self.storage.set_risk_lock(account.account_id, account.server, "DAILY_LOSS", f"Daily loss limit breached ({daily_loss_pct:.2f}% >= {self.config.daily_loss_limit_pct}%)")

        if drawdown_pct >= self.config.max_drawdown_pct:
            self.storage.set_risk_lock(account.account_id, account.server, "DRAWDOWN", f"Max drawdown limit breached ({drawdown_pct:.2f}% >= {self.config.max_drawdown_pct}%)")

        active_locks = self.storage.get_active_risk_locks(account.account_id, account.server)
        if active_locks:
            reasons = ", ".join(l["reason"] for l in active_locks)
            return RiskDecision(approved=False, direction=signal.direction, reason=f"Account locked by risk engine: {reasons}")

        # 3. Position & Intent Count Guards
        if open_positions_count >= self.config.max_bot_positions:
            return RiskDecision(
                approved=False,
                direction=signal.direction,
                reason=f"Max bot positions reached ({open_positions_count} >= {self.config.max_bot_positions})"
            )

        if pending_intents_count >= self.config.max_pending_intents:
            return RiskDecision(
                approved=False,
                direction=signal.direction,
                reason=f"Max pending intents reached ({pending_intents_count} >= {self.config.max_pending_intents})"
            )

        # 4. Spread vs ATR Filter
        atr = signal.atr or 0.0
        if atr <= 0.0:
            return RiskDecision(approved=False, direction=signal.direction, reason="Invalid or zero ATR value")

        spread = tick.spread
        spread_ratio = spread / atr
        if spread_ratio > self.config.max_spread_to_atr:
            return RiskDecision(
                approved=False,
                direction=signal.direction,
                reason=f"Spread / ATR ratio ({spread_ratio:.4f}) exceeds max allowed ({self.config.max_spread_to_atr:.4f})",
                atr=atr,
                spread=spread
            )

        # 5. Price & SL / TP Distance Calculation
        entry_price = tick.ask if signal.direction == "BUY" else tick.bid
        sl_distance = self.config.stop_atr_multiplier * atr

        if signal.direction == "BUY":
            raw_sl = entry_price - sl_distance
            sl = round_price(raw_sl, symbol_spec.digits, symbol_spec.trade_tick_size)
            actual_sl_dist = entry_price - sl
            raw_tp = entry_price + (actual_sl_dist * self.config.reward_risk_ratio)
            tp = round_price(raw_tp, symbol_spec.digits, symbol_spec.trade_tick_size)
        else:
            raw_sl = entry_price + sl_distance
            sl = round_price(raw_sl, symbol_spec.digits, symbol_spec.trade_tick_size)
            actual_sl_dist = sl - entry_price
            raw_tp = entry_price - (actual_sl_dist * self.config.reward_risk_ratio)
            tp = round_price(raw_tp, symbol_spec.digits, symbol_spec.trade_tick_size)

        if actual_sl_dist <= 0:
            return RiskDecision(approved=False, direction=signal.direction, reason="Calculated Stop Loss distance is non-positive")

        # 6. Risk Budget & Volume Position Sizing
        risk_budget = account.equity * (self.config.risk_per_trade_pct / 100.0)
        loss_per_unit = actual_sl_dist * symbol_spec.contract_size

        if loss_per_unit <= 0:
            return RiskDecision(approved=False, direction=signal.direction, reason="Loss per contract unit is non-positive")

        raw_volume = risk_budget / loss_per_unit
        volume = round_down_volume(raw_volume, symbol_spec.volume_min, symbol_spec.volume_step)

        if volume < symbol_spec.volume_min:
            return RiskDecision(
                approved=False,
                direction=signal.direction,
                reason=f"Calculated lot size ({raw_volume:.4f}) rounded down below minimum allowed ({symbol_spec.volume_min}) for risk budget ${risk_budget:.2f}",
                entry_price=entry_price,
                stop_loss=sl,
                take_profit=tp,
                risk_amount=risk_budget,
                atr=atr,
                spread=spread
            )

        if volume > symbol_spec.volume_max:
            volume = symbol_spec.volume_max

        return RiskDecision(
            approved=True,
            direction=signal.direction,
            reason="Risk checks passed and lot size validated",
            entry_price=entry_price,
            stop_loss=sl,
            take_profit=tp,
            volume=volume,
            risk_amount=risk_budget,
            atr=atr,
            spread=spread
        )
