class ConfluenceResult:
    def __init__(self, result, confluence_total, flag, failed_gates=None):
        self.result = result
        self.confluence_total = confluence_total
        self.flag = flag
        self.failed_gates = failed_gates or []

def clamp_score(score, min_val=0, max_val=100):
    return max(min_val, min(score, max_val))

def calculate_structure_score(structure_ctx, trade_direction):
    score = 50
    if structure_ctx.get("bos_aligned", False): score += 20
    if structure_ctx.get("ob_aligned", False): score += 15
    if trade_direction == "BUY" and structure_ctx.get("in_discount_zone", False): score += 15
    if trade_direction == "SELL" and structure_ctx.get("in_premium_zone", False): score += 15
    if structure_ctx.get("eq_hl_against", False): score -= 20
    return clamp_score(score)

def calculate_momentum_score(technical_ctx, trade_direction):
    score = 50
    if technical_ctx.get("rsi_favorable", False): score += 15
    if technical_ctx.get("macd_favorable", False): score += 20
    if technical_ctx.get("divergence_against", False): score -= 25
    return clamp_score(score)

def calculate_trend_score(adx_h1, technical_ctx, trade_direction):
    base = min(100, (adx_h1 / 40.0) * 100)
    score = base
    
    ema_aligned = False
    if trade_direction == "BUY" and technical_ctx.get("ema50_gt_ema200", False): ema_aligned = True
    if trade_direction == "SELL" and technical_ctx.get("ema50_lt_ema200", False): ema_aligned = True
    
    if ema_aligned: score += 10
    return clamp_score(score)

def calculate_fundamental_score(fundamental_ctx):
    score = 50
    score += fundamental_ctx.get("dxy_impact", 0)
    score += fundamental_ctx.get("yield_impact", 0)
    score += fundamental_ctx.get("safe_haven_impact", 0)
    return clamp_score(score)

def calculate_sentiment_score(sentiment_ctx):
    score = 50
    score += sentiment_ctx.get("positioning_impact", 0)
    return clamp_score(score)

def evaluate(symbol, trade_direction, technical_ctx, structure_ctx, fundamental_ctx, sentiment_ctx, regime_data):
    gate_trend_alignment = technical_ctx.get("trend_aligned_d1_h4_h1", False)
    gate_regime_match = regime_data.get("regime_matched_strategy", False)
    gate_no_news_blackout = fundamental_ctx.get("no_news_blackout", False)
    gate_spread_acceptable = technical_ctx.get("spread_acceptable", False)
    
    failed_gates = []
    if not gate_trend_alignment: failed_gates.append("trend_alignment")
    if not gate_regime_match: failed_gates.append("regime_match")
    if not gate_no_news_blackout: failed_gates.append("no_news_blackout")
    if not gate_spread_acceptable: failed_gates.append("spread_acceptable")
    
    if failed_gates:
        return ConfluenceResult("WAIT", 0, "WAIT", failed_gates)
        
    s_structure = calculate_structure_score(structure_ctx, trade_direction)
    s_momentum = calculate_momentum_score(technical_ctx, trade_direction)
    s_trend = calculate_trend_score(regime_data.get("adx_h1", 0), technical_ctx, trade_direction)
    s_fundamental = calculate_fundamental_score(fundamental_ctx)
    s_sentiment = calculate_sentiment_score(sentiment_ctx)
    
    confluence_score = (
        (0.30 * s_structure) +
        (0.25 * s_momentum) +
        (0.20 * s_trend) +
        (0.15 * s_fundamental) +
        (0.10 * s_sentiment)
    )
    
    if confluence_score >= 75:
        flag = "STRONG"
        result = "PROCEED"
    elif confluence_score >= 60:
        flag = "MODERATE"
        result = "PROCEED"
    else:
        flag = "WAIT"
        result = "WAIT"
        
    return ConfluenceResult(result, confluence_score, flag)
