import sys
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional
from trading_agent.adapters.base import BaseAdapter
from trading_agent.models import AccountSnapshot, SymbolSpec, Tick, Candle, BrokerResult

class MT5Adapter(BaseAdapter):
    """MetaTrader 5 desktop terminal adapter with lazy import and safety guards."""

    def __init__(self, login: Optional[int] = None, password: Optional[str] = None, server: Optional[str] = None, path: Optional[str] = None):
        self.login = login
        self.password = password
        self.server = server
        self.path = path
        self._connected = False
        self._mt5 = None

    def _get_mt5(self):
        """Lazy load MetaTrader5 python package."""
        if self._mt5 is None:
            try:
                import MetaTrader5 as mt5
                self._mt5 = mt5
            except ImportError as e:
                raise RuntimeError("MetaTrader5 python package is not installed on this system. MT5 adapter requires Windows and MetaTrader5 package.") from e
        return self._mt5

    def connect(self) -> bool:
        mt5 = self._get_mt5()
        kwargs = {}
        if self.path:
            kwargs["path"] = self.path
        if self.login and self.password and self.server:
            kwargs["login"] = self.login
            kwargs["password"] = self.password
            kwargs["server"] = self.server

        if not mt5.initialize(**kwargs):
            self._connected = False
            return False

        self._connected = True
        snapshot = self.account_snapshot()
        if not snapshot.is_demo():
            self.disconnect()
            raise PermissionError(f"REAL or CONTEST accounts are strictly blocked. Connected account trade mode: {snapshot.trade_mode}")

        return True

    def disconnect(self) -> bool:
        if self._mt5:
            self._mt5.shutdown()
        self._connected = False
        return True

    def is_connected(self) -> bool:
        if not self._connected or not self._mt5:
            return False
        return self._mt5.terminal_info() is not None

    def account_snapshot(self) -> AccountSnapshot:
        mt5 = self._get_mt5()
        acc = mt5.account_info()
        if acc is None:
            raise RuntimeError(f"Failed to fetch account info: {mt5.last_error()}")

        trade_mode_str = "REAL"
        if acc.trade_mode == mt5.ACCOUNT_TRADE_MODE_DEMO:
            trade_mode_str = "DEMO"
        elif acc.trade_mode == mt5.ACCOUNT_TRADE_MODE_CONTEST:
            trade_mode_str = "CONTEST"

        margin_mode_str = "NETTING" if acc.margin_mode == mt5.ACCOUNT_MARGIN_MODE_RETAIL_NETTING else "HEDGING"

        return AccountSnapshot(
            account_id=str(acc.login),
            server=acc.server,
            currency=acc.currency,
            balance=acc.balance,
            equity=acc.equity,
            margin=acc.margin,
            free_margin=acc.margin_free,
            trade_mode=trade_mode_str,
            margin_mode=margin_mode_str,
            timestamp=datetime.now(timezone.utc)
        )

    def symbol_info(self, symbol: str) -> SymbolSpec:
        mt5 = self._get_mt5()
        if not mt5.symbol_select(symbol, True):
            raise ValueError(f"Symbol {symbol} is not available in MT5 terminal")

        info = mt5.symbol_info(symbol)
        if info is None:
            raise ValueError(f"Failed to get symbol info for {symbol}: {mt5.last_error()}")

        return SymbolSpec(
            symbol=info.name,
            digits=info.digits,
            point=info.point,
            trade_tick_size=info.trade_tick_size,
            trade_tick_value=info.trade_tick_value,
            contract_size=info.trade_contract_size,
            volume_min=info.volume_min,
            volume_max=info.volume_max,
            volume_step=info.volume_step,
            trade_mode=info.trade_mode,
            filling_mode_flags=info.filling_mode,
            stops_level=info.trade_stops_level
        )

    def latest_tick(self, symbol: str) -> Tick:
        mt5 = self._get_mt5()
        tick = mt5.symbol_info_tick(symbol)
        if tick is None:
            raise RuntimeError(f"Failed to fetch tick for {symbol}: {mt5.last_error()}")
        return Tick(
            symbol=symbol,
            bid=tick.bid,
            ask=tick.ask,
            last=tick.last,
            volume=float(tick.volume),
            time=datetime.fromtimestamp(tick.time, timezone.utc)
        )

    def closed_bars(self, symbol: str, timeframe: str, count: int = 600) -> List[Candle]:
        mt5 = self._get_mt5()
        tf_map = {
            "M1": mt5.TIMEFRAME_M1,
            "M5": mt5.TIMEFRAME_M5,
            "M15": mt5.TIMEFRAME_M15,
            "M30": mt5.TIMEFRAME_M30,
            "H1": mt5.TIMEFRAME_H1,
            "H4": mt5.TIMEFRAME_H4,
            "D1": mt5.TIMEFRAME_D1,
        }
        tf = tf_map.get(timeframe, mt5.TIMEFRAME_M15)
        rates = mt5.copy_rates_from_pos(symbol, tf, 1, count)
        if rates is None or len(rates) == 0:
            raise RuntimeError(f"No rates returned for {symbol} ({timeframe}): {mt5.last_error()}")

        candles = []
        for r in rates:
            candles.append(Candle(
                time=datetime.fromtimestamp(r['time'], timezone.utc),
                open=float(r['open']),
                high=float(r['high']),
                low=float(r['low']),
                close=float(r['close']),
                volume=float(r['tick_volume'])
            ))
        return candles

    def open_positions(self, symbol: Optional[str] = None) -> List[Dict[str, Any]]:
        mt5 = self._get_mt5()
        positions = mt5.positions_get(symbol=symbol) if symbol else mt5.positions_get()
        if positions is None:
            raise RuntimeError(f"Failed to fetch open positions: {mt5.last_error()}")
        return [p._asdict() for p in positions]

    def open_orders(self, symbol: Optional[str] = None) -> List[Dict[str, Any]]:
        mt5 = self._get_mt5()
        orders = mt5.orders_get(symbol=symbol) if symbol else mt5.orders_get()
        if orders is None:
            raise RuntimeError(f"Failed to fetch open orders: {mt5.last_error()}")
        return [o._asdict() for o in orders]

    def deal_history(self, symbol: Optional[str] = None, count: int = 100) -> List[Dict[str, Any]]:
        mt5 = self._get_mt5()
        now = datetime.now(timezone.utc)
        from_date = now - timedelta(days=30)
        deals = mt5.history_deals_get(from_date, now, group=f"*{symbol}*" if symbol else "*")
        if deals is None:
            raise RuntimeError(f"Failed to fetch deal history: {mt5.last_error()}")
        return [d._asdict() for d in deals[-count:]]

    def estimate_profit(self, action: str, symbol: str, volume: float, open_price: float, close_price: float) -> float:
        mt5 = self._get_mt5()
        order_type = mt5.ORDER_TYPE_BUY if action == "BUY" else mt5.ORDER_TYPE_SELL
        profit = mt5.order_calc_profit(order_type, symbol, volume, open_price, close_price)
        if profit is None:
            spec = self.symbol_info(symbol)
            diff = (close_price - open_price) if action == "BUY" else (open_price - close_price)
            return diff * volume * spec.contract_size
        return float(profit)

    def estimate_margin(self, action: str, symbol: str, volume: float, open_price: float) -> float:
        mt5 = self._get_mt5()
        order_type = mt5.ORDER_TYPE_BUY if action == "BUY" else mt5.ORDER_TYPE_SELL
        margin = mt5.order_calc_margin(order_type, symbol, volume, open_price)
        if margin is None:
            spec = self.symbol_info(symbol)
            return (open_price * volume * spec.contract_size) / 100.0
        return float(margin)

    def _determine_filling_type(self, symbol: str) -> int:
        mt5 = self._get_mt5()
        spec = self.symbol_info(symbol)
        flags = spec.filling_mode_flags
        if flags & 1:  # FOK
            return mt5.ORDER_FILLING_FOK
        elif flags & 2:  # IOC
            return mt5.ORDER_FILLING_IOC
        return mt5.ORDER_FILLING_RETURN

    def order_check(self, symbol: str, action: str, volume: float, price: float, sl: float, tp: float) -> bool:
        mt5 = self._get_mt5()
        order_type = mt5.ORDER_TYPE_BUY if action == "BUY" else mt5.ORDER_TYPE_SELL
        request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": symbol,
            "volume": volume,
            "type": order_type,
            "price": price,
            "sl": sl,
            "tp": tp,
            "type_filling": self._determine_filling_type(symbol),
        }
        res = mt5.order_check(request)
        return res is not None and res.retcode == 0

    def submit_order(self, symbol: str, action: str, volume: float, price: float, sl: float, tp: float, comment: str = "", magic: int = 998877) -> BrokerResult:
        mt5 = self._get_mt5()
        order_type = mt5.ORDER_TYPE_BUY if action == "BUY" else mt5.ORDER_TYPE_SELL
        request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": symbol,
            "volume": volume,
            "type": order_type,
            "price": price,
            "sl": sl,
            "tp": tp,
            "magic": magic,
            "comment": comment[:31],
            "type_filling": self._determine_filling_type(symbol),
        }
        result = mt5.order_send(request)
        if result is None:
            return BrokerResult(
                success=False,
                retcode=-1,
                error_message=f"order_send returned None: {mt5.last_error()}"
            )

        success = (result.retcode == mt5.TRADE_RETCODE_DONE)
        return BrokerResult(
            success=success,
            retcode=result.retcode,
            deal_ticket=result.deal if result.deal > 0 else None,
            order_ticket=result.order if result.order > 0 else None,
            filled_volume=result.volume,
            price=result.price,
            comment=result.comment,
            error_message="" if success else f"Broker retcode: {result.retcode}"
        )
