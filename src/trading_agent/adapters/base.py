from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from trading_agent.models import AccountSnapshot, SymbolSpec, Tick, Candle, BrokerResult

class BaseAdapter(ABC):
    @abstractmethod
    def connect(self) -> bool:
        pass

    @abstractmethod
    def disconnect(self) -> bool:
        pass

    @abstractmethod
    def is_connected(self) -> bool:
        pass

    @abstractmethod
    def account_snapshot(self) -> AccountSnapshot:
        pass

    @abstractmethod
    def symbol_info(self, symbol: str) -> SymbolSpec:
        pass

    @abstractmethod
    def latest_tick(self, symbol: str) -> Tick:
        pass

    @abstractmethod
    def closed_bars(self, symbol: str, timeframe: str, count: int = 600) -> List[Candle]:
        pass

    @abstractmethod
    def open_positions(self, symbol: Optional[str] = None) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    def open_orders(self, symbol: Optional[str] = None) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    def deal_history(self, symbol: Optional[str] = None, count: int = 100) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    def estimate_profit(self, action: str, symbol: str, volume: float, open_price: float, close_price: float) -> float:
        pass

    @abstractmethod
    def estimate_margin(self, action: str, symbol: str, volume: float, open_price: float) -> float:
        pass

    @abstractmethod
    def order_check(self, symbol: str, action: str, volume: float, price: float, sl: float, tp: float) -> bool:
        pass

    @abstractmethod
    def submit_order(self, symbol: str, action: str, volume: float, price: float, sl: float, tp: float, comment: str = "", magic: int = 998877) -> BrokerResult:
        pass
