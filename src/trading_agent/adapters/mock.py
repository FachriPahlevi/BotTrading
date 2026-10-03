from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, Optional
import random
from trading_agent.adapters.base import BaseAdapter
from trading_agent.models import AccountSnapshot, SymbolSpec, Tick, Candle, BrokerResult

class MockAdapter(BaseAdapter):
    def __init__(self, initial_balance: float = 10000.0, symbol: str = "XAUUSDm"):
        self._connected = True
        self.balance = initial_balance
        self.equity = initial_balance
        self.symbol = symbol or "XAUUSDm"
        self._positions: List[Dict[str, Any]] = []
        self._orders: List[Dict[str, Any]] = []
        self._deals: List[Dict[str, Any]] = []
        self.ticket_counter = 100001
        self.base_price = 2000.0

    def connect(self) -> bool:
        self._connected = True
        return True

    def disconnect(self) -> bool:
        self._connected = False
        return True

    def is_connected(self) -> bool:
        return self._connected

    def account_snapshot(self) -> AccountSnapshot:
        return AccountSnapshot(
            account_id="12345678_MOCK",
            server="Exness-Trial-Mock",
            currency="USD",
            balance=self.balance,
            equity=self.equity,
            margin=0.0,
            free_margin=self.equity,
            trade_mode="DEMO",
            margin_mode="HEDGING",
            timestamp=datetime.now(timezone.utc)
        )

    def symbol_info(self, symbol: str) -> SymbolSpec:
        return SymbolSpec(
            symbol=symbol or self.symbol,
            digits=2,
            point=0.01,
            trade_tick_size=0.01,
            trade_tick_value=1.0,
            contract_size=100.0,
            volume_min=0.01,
            volume_max=100.0,
            volume_step=0.01,
            trade_mode=4,
            filling_mode_flags=1,
            stops_level=0
        )

    def latest_tick(self, symbol: str) -> Tick:
        bid = self.base_price + random.uniform(-0.5, 0.5)
        ask = bid + 0.20  # Spread 0.20
        return Tick(
            symbol=symbol or self.symbol,
            bid=round(bid, 2),
            ask=round(ask, 2),
            last=round(bid, 2),
            volume=100.0,
            time=datetime.now(timezone.utc)
        )

    def closed_bars(self, symbol: str, timeframe: str, count: int = 600) -> List[Candle]:
        candles = []
        now = datetime.now(timezone.utc)
        interval_min = 15
        if timeframe == "M1": interval_min = 1
        elif timeframe == "M5": interval_min = 5
        elif timeframe == "M15": interval_min = 15
        elif timeframe == "H1": interval_min = 60
        elif timeframe == "H4": interval_min = 240
        elif timeframe == "D1": interval_min = 1440

        price = self.base_price
        for i in range(count, 0, -1):
            bar_time = now - timedelta(minutes=i * interval_min)
            change = random.uniform(-2.0, 2.0)
            open_p = price
            close_p = price + change
            high_p = max(open_p, close_p) + random.uniform(0.1, 1.0)
            low_p = min(open_p, close_p) - random.uniform(0.1, 1.0)
            price = close_p
            candles.append(Candle(
                time=bar_time,
                open=round(open_p, 2),
                high=round(high_p, 2),
                low=round(low_p, 2),
                close=round(close_p, 2),
                volume=float(random.randint(50, 500))
            ))
        return candles

    def open_positions(self, symbol: Optional[str] = None) -> List[Dict[str, Any]]:
        if symbol:
            return [p for p in self._positions if p.get("symbol") == symbol]
        return list(self._positions)

    def open_orders(self, symbol: Optional[str] = None) -> List[Dict[str, Any]]:
        if symbol:
            return [o for o in self._orders if o.get("symbol") == symbol]
        return list(self._orders)

    def deal_history(self, symbol: Optional[str] = None, count: int = 100) -> List[Dict[str, Any]]:
        if symbol:
            return [d for d in self._deals if d.get("symbol") == symbol][-count:]
        return self._deals[-count:]

    def estimate_profit(self, action: str, symbol: str, volume: float, open_price: float, close_price: float) -> float:
        spec = self.symbol_info(symbol)
        diff = (close_price - open_price) if action == "BUY" else (open_price - close_price)
        return diff * volume * spec.contract_size

    def estimate_margin(self, action: str, symbol: str, volume: float, open_price: float) -> float:
        spec = self.symbol_info(symbol)
        return (open_price * volume * spec.contract_size) / 100.0  # Assume 1:100 leverage

    def order_check(self, symbol: str, action: str, volume: float, price: float, sl: float, tp: float) -> bool:
        return True

    def submit_order(self, symbol: str, action: str, volume: float, price: float, sl: float, tp: float, comment: str = "", magic: int = 998877) -> BrokerResult:
        ticket = self.ticket_counter
        self.ticket_counter += 1
        pos = {
            "ticket": ticket,
            "symbol": symbol,
            "type": action,
            "volume": volume,
            "price_open": price,
            "sl": sl,
            "tp": tp,
            "magic": magic,
            "comment": comment,
            "time": datetime.now(timezone.utc).isoformat()
        }
        self._positions.append(pos)
        deal = {
            "deal_ticket": ticket,
            "symbol": symbol,
            "direction": action,
            "volume": volume,
            "price": price,
            "sl": sl,
            "tp": tp,
            "profit": 0.0,
            "comment": comment,
            "time": datetime.now(timezone.utc).isoformat()
        }
        self._deals.append(deal)
        return BrokerResult(
            success=True,
            retcode=10009,  # TRADE_RETCODE_DONE
            deal_ticket=ticket,
            order_ticket=ticket,
            filled_volume=volume,
            price=price,
            comment=comment
        )
