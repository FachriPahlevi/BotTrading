# MetaTrader 5 type stubs for Pyright / static analysis
from typing import Any, NamedTuple, Optional, Sequence, Tuple, Union

TIMEFRAME_M1: int
TIMEFRAME_M2: int
TIMEFRAME_M3: int
TIMEFRAME_M4: int
TIMEFRAME_M5: int
TIMEFRAME_M6: int
TIMEFRAME_M10: int
TIMEFRAME_M12: int
TIMEFRAME_M15: int
TIMEFRAME_M20: int
TIMEFRAME_M30: int
TIMEFRAME_H1: int
TIMEFRAME_H2: int
TIMEFRAME_H3: int
TIMEFRAME_H4: int
TIMEFRAME_H6: int
TIMEFRAME_H8: int
TIMEFRAME_H12: int
TIMEFRAME_D1: int
TIMEFRAME_W1: int
TIMEFRAME_MN1: int

ACCOUNT_TRADE_MODE_DEMO: int
ACCOUNT_TRADE_MODE_CONTEST: int
ACCOUNT_TRADE_MODE_REAL: int

COPY_TICKS_ALL: int
COPY_TICKS_INFO: int
COPY_TICKS_TRADE: int

POSITION_TYPE_BUY: int
POSITION_TYPE_SELL: int

ORDER_TYPE_BUY: int
ORDER_TYPE_SELL: int
ORDER_TYPE_BUY_LIMIT: int
ORDER_TYPE_SELL_LIMIT: int
ORDER_TYPE_BUY_STOP: int
ORDER_TYPE_SELL_STOP: int
ORDER_TYPE_BUY_STOP_LIMIT: int
ORDER_TYPE_SELL_STOP_LIMIT: int
ORDER_TYPE_CLOSE_BY: int

TRADE_ACTION_DEAL: int
TRADE_ACTION_PENDING: int
TRADE_ACTION_SLTP: int
TRADE_ACTION_MODIFY: int
TRADE_ACTION_REMOVE: int
TRADE_ACTION_CLOSE_BY: int

ORDER_FILLING_FOK: int
ORDER_FILLING_IOC: int
ORDER_FILLING_RETURN: int
ORDER_FILLING_BOC: int

ORDER_TIME_GTC: int
ORDER_TIME_DAY: int
ORDER_TIME_SPECIFIED: int
ORDER_TIME_SPECIFIED_DAY: int

TRADE_RETCODE_REQUOTE: int
TRADE_RETCODE_REJECT: int
TRADE_RETCODE_CANCEL: int
TRADE_RETCODE_PLACED: int
TRADE_RETCODE_DONE: int
TRADE_RETCODE_DONE_PARTIAL: int
TRADE_RETCODE_ERROR: int
TRADE_RETCODE_TIMEOUT: int
TRADE_RETCODE_INVALID: int
TRADE_RETCODE_INVALID_VOLUME: int
TRADE_RETCODE_INVALID_PRICE: int
TRADE_RETCODE_INVALID_STOPS: int
TRADE_RETCODE_TRADE_DISABLED: int
TRADE_RETCODE_MARKET_CLOSED: int
TRADE_RETCODE_NO_MONEY: int
TRADE_RETCODE_PRICE_CHANGED: int
TRADE_RETCODE_PRICE_OFF: int
TRADE_RETCODE_INVALID_EXPIRATION: int
TRADE_RETCODE_ORDER_CHANGED: int
TRADE_RETCODE_TOO_MANY_REQUESTS: int
TRADE_RETCODE_NO_CHANGES: int
TRADE_RETCODE_SERVER_DISABLES_AT: int
TRADE_RETCODE_CLIENT_DISABLES_AT: int
TRADE_RETCODE_LOCKED: int
TRADE_RETCODE_FROZEN: int
TRADE_RETCODE_INVALID_FILL: int
TRADE_RETCODE_CONNECTION: int
TRADE_RETCODE_ONLY_REAL: int
TRADE_RETCODE_LIMIT_ORDERS: int
TRADE_RETCODE_LIMIT_VOLUME: int
TRADE_RETCODE_INVALID_ORDER: int
TRADE_RETCODE_POSITION_CLOSED: int
TRADE_RETCODE_INVALID_CLOSE_VOLUME: int
TRADE_RETCODE_CLOSE_ORDER_EXIST: int
TRADE_RETCODE_LIMIT_POSITIONS: int
TRADE_RETCODE_REJECT_CANCEL: int
TRADE_RETCODE_LONG_ONLY: int
TRADE_RETCODE_SHORT_ONLY: int
TRADE_RETCODE_CLOSE_ONLY: int
TRADE_RETCODE_FIFO_CLOSE: int

RES_S_OK: int
RES_E_FAIL: int
RES_E_INVALID_PARAMS: int
RES_E_NO_MEMORY: int
RES_E_NOT_FOUND: int
RES_E_INVALID_VERSION: int
RES_E_AUTH_FAILED: int
RES_E_UNSUPPORTED: int
RES_E_AUTO_TRADING_DISABLED: int
RES_E_INTERNAL_FAIL: int
RES_E_INTERNAL_FAIL_SEND: int
RES_E_INTERNAL_FAIL_RECEIVE: int
RES_E_INTERNAL_FAIL_INIT: int
RES_E_INTERNAL_FAIL_CONNECT: int
RES_E_INTERNAL_FAIL_TIMEOUT: int

def initialize(path: Optional[str] = ..., login: Optional[int] = ..., password: Optional[str] = ..., server: Optional[str] = ..., timeout: Optional[int] = ..., portable: Optional[bool] = ...) -> bool: ...
def shutdown() -> None: ...
def terminal_info() -> Optional[Any]: ...
def version() -> Tuple[int, int, str]: ...
def last_error() -> Tuple[int, str]: ...
def account_info() -> Optional[Any]: ...
def login(login: int, password: Optional[str] = ..., server: Optional[str] = ..., timeout: Optional[int] = ...) -> bool: ...

def symbols_total() -> int: ...
def symbols_get(group: Optional[str] = ...) -> Optional[Sequence[Any]]: ...
def symbol_info(symbol: str) -> Optional[Any]: ...
def symbol_info_tick(symbol: str) -> Optional[Any]: ...
def symbol_select(symbol: str, enable: bool = ...) -> bool: ...

def market_book_add(symbol: str) -> bool: ...
def market_book_get(symbol: str) -> Optional[Sequence[Any]]: ...
def market_book_release(symbol: str) -> bool: ...

def copy_rates_from(symbol: str, timeframe: int, date_from: Any, count: int) -> Optional[Any]: ...
def copy_rates_from_pos(symbol: str, timeframe: int, start_pos: int, count: int) -> Optional[Any]: ...
def copy_rates_range(symbol: str, timeframe: int, date_from: Any, date_to: Any) -> Optional[Any]: ...
def copy_ticks_from(symbol: str, date_from: Any, count: int, flags: int) -> Optional[Any]: ...
def copy_ticks_range(symbol: str, date_from: Any, date_to: Any, flags: int) -> Optional[Any]: ...

def orders_total() -> int: ...
def orders_get(symbol: Optional[str] = ..., group: Optional[str] = ..., ticket: Optional[int] = ...) -> Optional[Sequence[Any]]: ...
def order_calc_margin(action: int, symbol: str, volume: float, price: float) -> Optional[float]: ...
def order_calc_profit(action: int, symbol: str, volume: float, price_open: float, price_close: float) -> Optional[float]: ...
def order_check(request: dict[str, Any]) -> Optional[Any]: ...
def order_send(request: dict[str, Any]) -> Optional[Any]: ...

def positions_total() -> int: ...
def positions_get(symbol: Optional[str] = ..., group: Optional[str] = ..., ticket: Optional[int] = ...) -> Optional[Sequence[Any]]: ...

def history_orders_total(date_from: Any = ..., date_to: Any = ...) -> int: ...
def history_orders_get(date_from: Optional[Any] = ..., date_to: Optional[Any] = ..., group: Optional[str] = ..., ticket: Optional[int] = ..., position: Optional[int] = ...) -> Optional[Sequence[Any]]: ...
def history_deals_total(date_from: Any = ..., date_to: Any = ...) -> int: ...
def history_deals_get(date_from: Optional[Any] = ..., date_to: Optional[Any] = ..., group: Optional[str] = ..., ticket: Optional[int] = ..., position: Optional[int] = ...) -> Optional[Sequence[Any]]: ...
