from app.engines import regime_engine, confluence_engine

class Decision:
    def __init__(self, action, confidence=0, confluence_flag="WAIT", entry=0, sl=0, tp=None, reason="", invalidation="", regime_at_decision="", symbol=""):
        self.action = action
        self.confidence = confidence
        self.confluence_flag = confluence_flag
        self.entry = entry
        self.sl = sl
        self.tp = tp or []
        self.reason = reason
        self.invalidation = invalidation
        self.regime_at_decision = regime_at_decision
        self.symbol = symbol

def decide(symbol, df_h4, df_h1, technical_ctx, structure_ctx, fundamental_ctx, sentiment_ctx):
    regime_data = regime_engine.get_latest(symbol, df_h4, df_h1)
    
    trade_direction = "BUY" if regime_data["regime"] == "TRENDING_UP" else "SELL"
    
    confluence = confluence_engine.evaluate(
        symbol, trade_direction, technical_ctx, structure_ctx, fundamental_ctx, sentiment_ctx, regime_data
    )
    
    if confluence.result == "WAIT":
        return Decision(action="WAIT", symbol=symbol, reason=f"confluence_gate_failed: {confluence.failed_gates}")
        
    if confluence.confluence_total < 60:
        return Decision(action="WAIT", symbol=symbol, reason="confluence_score_too_low")
        
    ai_output = {
        "direction": trade_direction,
        "raw_confidence": 75,
        "entry": 2000.0,
        "sl": 1990.0 if trade_direction == "BUY" else 2010.0,
        "tp1": 2020.0 if trade_direction == "BUY" else 1980.0,
        "tp2": 2030.0 if trade_direction == "BUY" else 1970.0,
        "reason": "AI confidence high on structural support",
        "invalidation": "Price breaches structure"
    }
    
    if ai_output["raw_confidence"] < 60:
        return Decision(action="WAIT", symbol=symbol, reason="ai_confidence_below_reject_zone")
        
    strategy_compatible = True
    if not strategy_compatible:
        return Decision(action="WAIT", symbol=symbol, reason="regime_mismatch")
        
    return Decision(
        action=ai_output["direction"],
        confidence=ai_output["raw_confidence"],
        confluence_flag=confluence.flag,
        entry=ai_output["entry"],
        sl=ai_output["sl"],
        tp=[ai_output["tp1"], ai_output["tp2"]],
        reason=ai_output["reason"],
        invalidation=ai_output["invalidation"],
        regime_at_decision=regime_data["regime"],
        symbol=symbol
    )
