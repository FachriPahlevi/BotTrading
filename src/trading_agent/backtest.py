import os
import json
import pandas as pd
import numpy as np
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from trading_agent.config import AppConfig
from trading_agent.models import Candle, Tick, SymbolSpec, AccountSnapshot
from trading_agent.strategy import EMAATRStrategy
from trading_agent.risk import RiskEngine
from trading_agent.brokers.paper import PaperBroker
from trading_agent.storage import StorageManager

class BacktestEngine:
    """Chronological backtesting engine with strategy evaluation, risk sizing, and paper broker execution."""

    def __init__(self, config: AppConfig, symbol_spec: Optional[SymbolSpec] = None):
        self.config = config
        self.symbol_spec = symbol_spec or SymbolSpec(
            symbol=config.symbol or config.reference_symbol,
            digits=2,
            point=0.01,
            trade_tick_size=0.01,
            trade_tick_value=1.0,
            contract_size=100.0,
            volume_min=0.01,
            volume_max=100.0,
            volume_step=0.01
        )
        self.strategy = EMAATRStrategy(
            ema_fast=config.ema_fast,
            ema_slow=config.ema_slow,
            ema_trend=config.ema_trend,
            atr_period=config.atr_period,
            strategy_version=config.strategy_version
        )

    def run_backtest(self, candles: List[Candle], initial_balance: Optional[float] = None) -> Dict[str, Any]:
        balance = initial_balance or self.config.paper_initial_balance
        storage = StorageManager(db_path=":memory:")
        risk_engine = RiskEngine(self.config, storage)
        broker = PaperBroker(initial_balance=balance)

        equity_curve = []
        pending_signal = None

        min_warmup = self.config.min_warmup_bars
        if len(candles) <= min_warmup:
            return {"error": f"Candle count ({len(candles)}) must exceed min_warmup_bars ({min_warmup})"}

        for i in range(min_warmup, len(candles)):
            curr_bar = candles[i]
            prev_bars = candles[:i]

            # 1. Process pending signal from previous bar at open of current bar (AC16)
            if pending_signal and pending_signal["decision"].approved:
                dec = pending_signal["decision"]
                fill_price = curr_bar.open
                broker.execute_order(
                    symbol=self.symbol_spec.symbol,
                    direction=dec.direction,
                    volume=dec.volume,
                    price=fill_price,
                    sl=dec.stop_loss,
                    tp=dec.take_profit,
                    time=curr_bar.time,
                    contract_size=self.symbol_spec.contract_size
                )
                pending_signal = None

            # 2. Process candle High/Low against open paper positions
            broker.process_candle(curr_bar, self.symbol_spec.contract_size)
            equity_curve.append({
                "time": curr_bar.time.isoformat(),
                "balance": broker.balance,
                "equity": broker.equity
            })

            # 3. Generate new signal on completed previous bars
            sig = self.strategy.generate_signal(prev_bars, self.symbol_spec.symbol, self.config.timeframe)
            if sig.direction in ("BUY", "SELL"):
                # Mock tick using current bar open price
                tick = Tick(
                    symbol=self.symbol_spec.symbol,
                    bid=curr_bar.open,
                    ask=curr_bar.open + (self.config.max_spread_to_atr * (sig.atr or 0.1)),
                    last=curr_bar.open,
                    volume=curr_bar.volume,
                    time=curr_bar.time
                )
                acc = broker.get_account_snapshot()
                dec = risk_engine.evaluate_risk(
                    signal=sig,
                    account=acc,
                    symbol_spec=self.symbol_spec,
                    tick=tick,
                    open_positions_count=len(broker.positions)
                )
                if dec.approved:
                    pending_signal = {"signal": sig, "decision": dec}

        # Force liquidating open positions at end of backtest (forced-end exit)
        if candles and broker.positions:
            last_close = candles[-1].close
            for pos in list(broker.positions):
                pnl = (last_close - pos["open_price"]) * pos["volume"] * self.symbol_spec.contract_size if pos["direction"] == "BUY" else (pos["open_price"] - last_close) * pos["volume"] * self.symbol_spec.contract_size
                broker.balance += pnl
                broker.closed_trades.append({
                    "ticket": pos["ticket"],
                    "symbol": pos["symbol"],
                    "direction": pos["direction"],
                    "volume": pos["volume"],
                    "open_price": pos["open_price"],
                    "close_price": last_close,
                    "open_time": pos["open_time"],
                    "close_time": candles[-1].time,
                    "pnl": round(pnl, 2),
                    "commission": pos["commission"],
                    "net_pnl": round(pnl - pos["commission"], 2),
                    "exit_reason": "Forced-end liquidation"
                })
            broker.positions = []
            broker.equity = broker.balance

        # Calculate metrics
        trades = broker.closed_trades
        total_trades = len(trades)
        net_return = broker.balance - balance
        net_return_pct = (net_return / balance) * 100.0

        wins = [t for t in trades if t["net_pnl"] > 0]
        losses = [t for t in trades if t["net_pnl"] <= 0]
        win_rate = (len(wins) / total_trades * 100.0) if total_trades > 0 else 0.0

        gross_profit = sum(t["net_pnl"] for t in wins)
        gross_loss = abs(sum(t["net_pnl"] for t in losses))
        profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else (float("inf") if gross_profit > 0 else 0.0)

        # Max drawdown
        equities = [e["equity"] for e in equity_curve]
        peak = balance
        max_dd = 0.0
        for eq in equities:
            if eq > peak: peak = eq
            dd = (peak - eq) / peak * 100.0
            if dd > max_dd: max_dd = dd

        expectancy = (net_return / total_trades) if total_trades > 0 else 0.0
        total_commission = sum(t["commission"] for t in trades)

        return {
            "initial_balance": balance,
            "final_balance": round(broker.balance, 2),
            "net_return": round(net_return, 2),
            "net_return_pct": round(net_return_pct, 2),
            "total_trades": total_trades,
            "win_rate_pct": round(win_rate, 2),
            "profit_factor": "N/A" if gross_loss == 0 else round(profit_factor, 2),
            "max_drawdown_pct": round(max_dd, 2),
            "expectancy_per_trade": round(expectancy, 2),
            "total_commission": round(total_commission, 2),
            "trades": trades,
            "equity_curve": equity_curve,
            "data_source_label": "synthetic_or_historical"
        }

    def export_csv(self, backtest_results: Dict[str, Any], filepath: str):
        trades = backtest_results.get("trades", [])
        columns = ["ticket", "symbol", "direction", "volume", "open_price", "close_price", "open_time", "close_time", "pnl", "commission", "net_pnl", "exit_reason"]
        df = pd.DataFrame(trades, columns=columns if not trades else None)
        df.to_csv(filepath, index=False)
