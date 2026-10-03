import yaml
import pandas as pd
import numpy as np
from src.trading_agent.config import load_config
from app.api.endpoints import _build_market_payload
from app.engines.risk_engine import validate
from collections import namedtuple

# 1. Test Config
config = load_config("config.yaml")
assert config.daily_loss_limit_pct == 3.0, f"Got {config.daily_loss_limit_pct}"
assert config.max_drawdown_pct == 20.0, f"Got {config.max_drawdown_pct}"
print("Config loading works!")

# 2. Test RSI Zero Loss
candles = []
for i in range(100):
    candles.append({"time": i, "open": 100+i, "high": 100+i, "low": 100+i, "close": 100+i}) # price only goes up, so 0 losses

payload = _build_market_payload("XAUUSD", "1h", candles)
rsi = payload["candles"][-1]["rsi_14"]
assert rsi == 100.0, f"RSI should be 100.0 when losses are 0, got {rsi}"
print("RSI calc works!")

# 3. Test Risk Engine Dynamic Validation
Decision = namedtuple("Decision", ["confidence", "confluence_flag", "entry", "sl", "tp"])
dec = Decision(confidence=80, confluence_flag="HIGH", entry=2000, sl=1990, tp=[2020])
account = {"daily_loss_pct": 5.0, "consecutive_losses": 0} # 5.0 > 3.0 limit
res = validate(dec, account, {"spread": 0, "max_spread": 100})
assert res.approved == False
assert "max_daily_loss" in res.reason, f"Expected max_daily_loss failure, got {res.reason}"

account2 = {"daily_loss_pct": 1.0, "consecutive_losses": 0, "daily_trades": 20} # 20 > 10
res2 = validate(dec, account2, {"spread": 0, "max_spread": 100})
assert res2.approved == False
assert "max_daily_trades" in res2.reason, f"Expected max_daily_trades failure, got {res2.reason}"
print("Risk validation works!")

