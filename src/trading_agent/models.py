from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import List, Optional, Literal
from dataclasses import dataclass, field
from pydantic import BaseModel, Field

def current_utc_time() -> datetime:
    return datetime.now(timezone.utc)

class AccountSnapshot(BaseModel):
    account_id: str
    server: str
    currency: str = "USD"
    balance: float
    equity: float
    margin: float = 0.0
    free_margin: float = 0.0
    trade_mode: str = "DEMO"  # DEMO, REAL, CONTEST
    margin_mode: str = "NETTING"  # NETTING, HEDGING
    timestamp: datetime = Field(default_factory=current_utc_time)

    def is_demo(self) -> bool:
        return self.trade_mode.upper() == "DEMO"

class SymbolSpec(BaseModel):
    symbol: str
    digits: int = 2
    point: float = 0.01
    trade_tick_size: float = 0.01
    trade_tick_value: float = 1.0
    contract_size: float = 100.0
    volume_min: float = 0.01
    volume_max: float = 100.0
    volume_step: float = 0.01
    trade_mode: int = 4  # FULL_ACCESS
    filling_mode_flags: int = 1  # FOK, IOC, RETURN
    stops_level: int = 0

class Tick(BaseModel):
    symbol: str
    bid: float
    ask: float
    last: float = 0.0
    volume: float = 0.0
    time: datetime = Field(default_factory=current_utc_time)

    @property
    def spread(self) -> float:
        return max(0.0, self.ask - self.bid)

class Candle(BaseModel):
    time: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0

class Signal(BaseModel):
    symbol: str
    timeframe: str
    bar_time: datetime
    strategy_version: str = "ema_atr_v1"
    direction: Literal["BUY", "SELL", "HOLD"]
    reason: str
    ema_fast: Optional[float] = None
    ema_slow: Optional[float] = None
    ema_trend: Optional[float] = None
    atr: Optional[float] = None
    created_at: datetime = Field(default_factory=current_utc_time)

class RiskDecision(BaseModel):
    approved: bool
    direction: Literal["BUY", "SELL", "HOLD"]
    reason: str
    entry_price: float = 0.0
    stop_loss: float = 0.0
    take_profit: float = 0.0
    volume: float = 0.0
    risk_amount: float = 0.0
    atr: float = 0.0
    spread: float = 0.0

class OrderIntent(BaseModel):
    idempotency_key: str
    account_login: str
    server: str
    symbol: str
    timeframe: str
    bar_time: datetime
    strategy_version: str
    direction: Literal["BUY", "SELL"]
    requested_volume: float
    entry_price: float
    stop_loss: float
    take_profit: float
    status: Literal["CREATED", "VALIDATED", "SUBMITTING", "FILLED", "PARTIAL", "REJECTED", "UNKNOWN"] = "CREATED"
    reject_reason: Optional[str] = None
    deal_ticket: Optional[int] = None
    order_ticket: Optional[int] = None
    filled_volume: float = 0.0
    filled_price: float = 0.0
    created_at: datetime = Field(default_factory=current_utc_time)
    updated_at: datetime = Field(default_factory=current_utc_time)

class BrokerResult(BaseModel):
    success: bool
    retcode: int = 0
    deal_ticket: Optional[int] = None
    order_ticket: Optional[int] = None
    filled_volume: float = 0.0
    price: float = 0.0
    comment: str = ""
    error_message: str = ""

class ExecutionRecord(BaseModel):
    idempotency_key: str
    account_login: str
    server: str
    symbol: str
    direction: str
    volume: float
    price: float
    sl: float
    tp: float
    deal_ticket: Optional[int] = None
    order_ticket: Optional[int] = None
    status: str
    executed_at: datetime = Field(default_factory=current_utc_time)

def round_price(price: float, digits: int, step: float) -> float:
    if step <= 0:
        return round(price, digits)
    dec_price = Decimal(str(price))
    dec_step = Decimal(str(step))
    rounded = (dec_price / dec_step).quantize(Decimal('1'), rounding=ROUND_HALF_UP) * dec_step
    return float(rounded)

def round_down_volume(volume: float, min_vol: float, step: float) -> float:
    if step <= 0:
        return volume
    dec_vol = Decimal(str(volume))
    dec_step = Decimal(str(step))
    rounded = (dec_vol // dec_step) * dec_step
    result = float(rounded)
    return result if result >= min_vol else 0.0
