import os
import yaml
from typing import Literal, Optional
from pydantic import BaseModel, Field, field_validator, ConfigDict

class AppConfig(BaseModel):
    model_config = ConfigDict(extra='ignore')
    
    mode: Literal["paper", "demo"] = "paper"
    data_source: Literal["mock", "mt5"] = "mock"
    symbol: str = ""
    reference_symbol: str = "XAUUSD"
    timeframe: Literal["M1", "M5", "M15", "M30", "H1", "H4", "D1"] = "M15"
    
    ema_fast: int = Field(default=20, gt=0)
    ema_slow: int = Field(default=50, gt=0)
    ema_trend: int = Field(default=200, gt=0)
    atr_period: int = Field(default=14, gt=0)
    
    stop_atr_multiplier: float = Field(default=2.0, gt=0)
    reward_risk_ratio: float = Field(default=2.0, gt=0)
    risk_per_trade_pct: float = Field(default=0.5, gt=0, le=5.0)
    daily_loss_limit_pct: float = Field(default=2.0, gt=0, le=20.0)
    max_drawdown_pct: float = Field(default=5.0, gt=0, le=50.0)
    
    max_bot_positions: int = Field(default=1, ge=1)
    max_pending_intents: int = Field(default=1, ge=1)
    max_spread_to_atr: float = Field(default=0.10, gt=0)
    max_tick_age_seconds: int = Field(default=10, ge=1)
    polling_seconds: int = Field(default=2, ge=1)
    min_warmup_bars: int = Field(default=600, ge=60)
    maximum_signal_age_seconds: int = Field(default=30, ge=5)
    max_deviation_points: int = Field(default=20, ge=0)
    day_boundary_timezone: str = "UTC"
    paper_initial_balance: float = Field(default=10000.0, gt=0)
    strategy_version: str = "ema_atr_v1"
    magic_number: int = Field(default=998877, gt=0)
    db_path: str = "trading_agent.db"

    @field_validator("ema_slow")
    @classmethod
    def validate_ema_slow(cls, v: int, info) -> int:
        fast = info.data.get("ema_fast", 20)
        if v <= fast:
            raise ValueError(f"ema_slow ({v}) must be greater than ema_fast ({fast})")
        return v

    @field_validator("ema_trend")
    @classmethod
    def validate_ema_trend(cls, v: int, info) -> int:
        slow = info.data.get("ema_slow", 50)
        if v <= slow:
            raise ValueError(f"ema_trend ({v}) must be greater than ema_slow ({slow})")
        return v

    @field_validator("symbol")
    @classmethod
    def validate_symbol_for_mt5(cls, v: str, info) -> str:
        data_source = info.data.get("data_source", "mock")
        if data_source == "mt5" and not v.strip():
            raise ValueError("symbol is required when data_source is mt5")
        return v.strip()

def load_config(config_path: Optional[str] = None) -> AppConfig:
    if config_path and os.path.exists(config_path):
        with open(config_path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
            
        # Explicit mapping from web nested structure to flat core AppConfig
        if "risk_engine" in data and isinstance(data["risk_engine"], dict):
            risk = data["risk_engine"]
            if "max_risk_per_trade_pct" in risk:
                data["risk_per_trade_pct"] = float(risk["max_risk_per_trade_pct"])
            if "max_daily_loss_pct" in risk:
                data["daily_loss_limit_pct"] = float(risk["max_daily_loss_pct"])
            if "max_drawdown_hard_stop_pct" in risk:
                data["max_drawdown_pct"] = float(risk["max_drawdown_hard_stop_pct"])
            if "min_risk_reward" in risk:
                data["reward_risk_ratio"] = float(risk["min_risk_reward"])
                
        return AppConfig(**data)
    return AppConfig()
