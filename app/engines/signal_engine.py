from datetime import datetime, timedelta
from app.engines import risk_engine

def process_decision(decision):
    signal = {
        "symbol": decision.symbol,
        "direction": decision.action,
        "entry": decision.entry,
        "sl": decision.sl,
        "tp": decision.tp,
        "confidence": decision.confidence,
        "status": "NEW",
        "valid_until": datetime.now() + timedelta(minutes=30)
    }

    account_state = {"balance": 10000.0, "id": 1}
    risk_result = risk_engine.validate(decision, account_state, {"tick_value": 1.0, "tick_size": 0.01})

    if not risk_result.approved:
        signal["status"] = "REJECTED"
        signal["reject_reason"] = risk_result.reason
        return signal

    signal["status"] = "APPROVED"
    mode = "SEMI_AUTO"

    if mode == "ANALYSIS_ONLY":
        return signal

    if mode == "SEMI_AUTO":
        signal["status"] = "WAITING"
        return signal

    if mode == "FULL_AUTO":
        execution_success = True
        
        if execution_success:
            signal["status"] = "EXECUTED"
        else:
            signal["status"] = "CANCELLED"
            
        return signal
        
    return signal
