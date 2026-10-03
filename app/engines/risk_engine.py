from app.core.config import settings

class RiskResult:
    def __init__(self, approved, reason=None, lot_size=0, risk_percent_used=0):
        self.approved = approved
        self.reason = reason if isinstance(reason, list) else ([reason] if reason else [])
        self.lot_size = lot_size
        self.risk_percent_used = risk_percent_used

def get_risk_percent(ai_confidence, confluence_flag, consecutive_losses):
    if ai_confidence < 60:
        return 0
    elif 60 <= ai_confidence < 70:
        base_risk = 0.5
    elif 70 <= ai_confidence < 85:
        base_risk = 1.0
    else:
        base_risk = 1.0

    if consecutive_losses >= 5:
        return 0
    elif consecutive_losses >= 3:
        base_risk *= 0.5

    if confluence_flag == "MODERATE":
        base_risk *= 0.75

    return base_risk

def calculate_lot_size(account_balance, risk_percent, entry_price, stop_loss_price, tick_value, tick_size, broker_min_lot=0.01, broker_max_lot=100.0):
    risk_amount = account_balance * (risk_percent / 100.0)
    sl_distance = abs(entry_price - stop_loss_price)
    value_per_point = tick_value / tick_size
    
    if sl_distance == 0 or value_per_point == 0:
        return 0
        
    lot_size = risk_amount / (sl_distance * value_per_point)
    lot_size = int(lot_size * 100) / 100.0
    
    if lot_size > broker_max_lot:
        lot_size = broker_max_lot
        
    return lot_size

def validate(decision, account_state, broker_info):
    risk_config = settings.get("risk_engine", {})
    max_risk_per_trade_pct = risk_config.get("max_risk_per_trade_pct", 1.0)
    max_daily_loss_pct = risk_config.get("max_daily_loss_pct", 3.0)
    max_weekly_loss_pct = risk_config.get("max_weekly_loss_pct", 5.0)
    max_drawdown_hard_stop_pct = risk_config.get("max_drawdown_hard_stop_pct", 20.0)
    min_risk_reward = risk_config.get("min_risk_reward", 1.5)
    
    checks = []
    
    daily_loss_pct = account_state.get("daily_loss_pct", 0.0)
    checks.append({"passed": daily_loss_pct <= max_daily_loss_pct, "reason": "max_daily_loss"})
    
    daily_trades = account_state.get("daily_trades", 0)
    checks.append({"passed": daily_trades <= risk_config.get("max_daily_trades", 10), "reason": "max_daily_trades"})
    
    concurrent_positions = account_state.get("concurrent_positions", 0)
    checks.append({"passed": concurrent_positions <= risk_config.get("max_concurrent_positions", 3), "reason": "max_concurrent_positions"})
    
    spread = broker_info.get("spread", 0)
    checks.append({"passed": spread <= broker_info.get("max_spread", 999), "reason": "max_spread_acceptable"})
    
    checks.append({"passed": True, "reason": "news_blackout_window_passed"}) # TODO: Implement news engine
    
    sl_dist = abs(decision.entry - decision.sl)
    tp_dist = abs(decision.tp[0] - decision.entry) if decision.tp and len(decision.tp) > 0 else 0
    rr = (tp_dist / sl_dist) if sl_dist > 0 else 0
    
    if rr < min_risk_reward:
        checks.append({"passed": False, "reason": "min_risk_reward_failed"})
    else:
        checks.append({"passed": True, "reason": "min_risk_reward_passed"})
        
    consecutive_losses = account_state.get("consecutive_losses", 0)
    
    if consecutive_losses >= 5:
        return RiskResult(False, "auto_pause_5_consecutive_losses")
        
    risk_percent = get_risk_percent(decision.confidence, decision.confluence_flag, consecutive_losses)
    if risk_percent > max_risk_per_trade_pct:
        risk_percent = max_risk_per_trade_pct
        
    checks.append({"passed": risk_percent > 0, "reason": "max_risk_per_trade"})
        
    if risk_percent == 0:
        return RiskResult(False, "risk_percent_calculated_zero")
        
    weekly_loss_pct = account_state.get("weekly_loss_pct", 0.0)
    if weekly_loss_pct > max_weekly_loss_pct:
        return RiskResult(False, "weekly_drawdown_limit_breached")
        
    current_dd_pct = account_state.get("current_drawdown_pct", 0.0)
    if current_dd_pct > max_drawdown_hard_stop_pct:
        return RiskResult(False, "max_drawdown_exceeded")
        
    failed_checks = [c["reason"] for c in checks if not c["passed"]]
    if failed_checks:
        return RiskResult(False, failed_checks)
        
    lot_size = calculate_lot_size(
        account_state.get("balance", 0), 
        risk_percent, 
        decision.entry, 
        decision.sl,
        broker_info.get("tick_value", 1.0),
        broker_info.get("tick_size", 0.01),
        broker_info.get("min_lot", 0.01),
        broker_info.get("max_lot", 100.0)
    )
    
    if lot_size < broker_info.get("min_lot", 0.01):
        return RiskResult(False, "lot_below_broker_minimum")
        
    return RiskResult(True, lot_size=lot_size, risk_percent_used=risk_percent)
