from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from trading_agent.models import AccountSnapshot, SymbolSpec, Tick, Candle, BrokerResult

class PaperBroker:
    """Paper trading broker engine simulating positions, execution, spreads, commission, and SL/TP fills."""

    def __init__(self, initial_balance: float = 10000.0, commission_per_lot: float = 7.0, spread_fixed: float = 0.20, slippage_points: float = 0.0):
        self.balance = initial_balance
        self.equity = initial_balance
        self.commission_per_lot = commission_per_lot
        self.spread_fixed = spread_fixed
        self.slippage_points = slippage_points
        self.positions: List[Dict[str, Any]] = []
        self.closed_trades: List[Dict[str, Any]] = []
        self.ticket_counter = 500001

    def get_account_snapshot(self) -> AccountSnapshot:
        return AccountSnapshot(
            account_id="PAPER_BROKER",
            server="PaperSim",
            currency="USD",
            balance=round(self.balance, 2),
            equity=round(self.equity, 2),
            margin=0.0,
            free_margin=round(self.equity, 2),
            trade_mode="DEMO",
            margin_mode="HEDGING",
            timestamp=datetime.now(timezone.utc)
        )

    def execute_order(self, symbol: str, direction: str, volume: float, price: float, sl: float, tp: float, time: datetime, contract_size: float = 100.0) -> BrokerResult:
        ticket = self.ticket_counter
        self.ticket_counter += 1

        commission = volume * self.commission_per_lot
        self.balance -= commission
        self.equity -= commission

        pos = {
            "ticket": ticket,
            "symbol": symbol,
            "direction": direction,
            "volume": volume,
            "open_price": price,
            "sl": sl,
            "tp": tp,
            "open_time": time,
            "commission": commission,
            "contract_size": contract_size
        }
        self.positions.append(pos)
        return BrokerResult(
            success=True,
            retcode=10009,
            deal_ticket=ticket,
            order_ticket=ticket,
            filled_volume=volume,
            price=price,
            comment="Paper order filled"
        )

    def process_candle(self, candle: Candle, contract_size: float = 100.0) -> List[Dict[str, Any]]:
        """Check open positions against candle high/low for SL/TP hits using SL-first collision rule."""
        exited = []
        remaining = []

        for pos in self.positions:
            high = candle.high
            low = candle.low
            direction = pos["direction"]
            sl = pos["sl"]
            tp = pos["tp"]
            vol = pos["volume"]
            open_p = pos["open_price"]

            hit_sl = False
            hit_tp = False
            exit_price = 0.0
            exit_reason = ""

            if direction == "BUY":
                if low <= sl: hit_sl = True
                if high >= tp: hit_tp = True

                if hit_sl and hit_tp:
                    # SL-first collision rule (AC15)
                    hit_sl = True
                    hit_tp = False
                    exit_reason = "SL (ambiguity collision)"

                if hit_sl:
                    exit_price = sl
                    exit_reason = exit_reason or "SL"
                elif hit_tp:
                    exit_price = tp
                    exit_reason = "TP"
            else:  # SELL
                if high >= sl: hit_sl = True
                if low <= tp: hit_tp = True

                if hit_sl and hit_tp:
                    # SL-first collision rule (AC15)
                    hit_sl = True
                    hit_tp = False
                    exit_reason = "SL (ambiguity collision)"

                if hit_sl:
                    exit_price = sl
                    exit_reason = exit_reason or "SL"
                elif hit_tp:
                    exit_price = tp
                    exit_reason = "TP"

            if hit_sl or hit_tp:
                pnl = (exit_price - open_p) * vol * contract_size if direction == "BUY" else (open_p - exit_price) * vol * contract_size
                self.balance += pnl
                closed_trade = {
                    "ticket": pos["ticket"],
                    "symbol": pos["symbol"],
                    "direction": direction,
                    "volume": vol,
                    "open_price": open_p,
                    "close_price": exit_price,
                    "open_time": pos["open_time"],
                    "close_time": candle.time,
                    "pnl": round(pnl, 2),
                    "commission": pos["commission"],
                    "net_pnl": round(pnl - pos["commission"], 2),
                    "exit_reason": exit_reason
                }
                self.closed_trades.append(closed_trade)
                exited.append(closed_trade)
            else:
                remaining.append(pos)

        self.positions = remaining
        self.update_equity(candle.close, contract_size)
        return exited

    def update_equity(self, current_price: float, contract_size: float = 100.0):
        unrealized = 0.0
        for pos in self.positions:
            direction = pos["direction"]
            vol = pos["volume"]
            open_p = pos["open_price"]
            diff = (current_price - open_p) if direction == "BUY" else (open_p - current_price)
            unrealized += diff * vol * contract_size
        self.equity = round(self.balance + unrealized, 2)
