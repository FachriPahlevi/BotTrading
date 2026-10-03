import pandas as pd
import pandas_ta as ta

def calculate_trend_strength(adx_value, plus_di, minus_di):
    if pd.isna(adx_value):
        return "NO_TREND", "NONE"
        
    if adx_value < 20:
        strength = "NO_TREND"
    elif 20 <= adx_value < 25:
        strength = "WEAK_TREND"
    elif 25 <= adx_value < 40:
        strength = "STRONG_TREND"
    else:
        strength = "VERY_STRONG_TREND"
        
    direction = "UP" if plus_di > minus_di else "DOWN"
    return strength, direction

def get_volatility_state(atr_current, atr_history):
    if len(atr_history) == 0 or pd.isna(atr_current):
        return "NORMAL_VOLATILITY"
    
    percentile = (atr_history < atr_current).mean() * 100
    
    if percentile < 20:
        return "LOW_VOLATILITY_COMPRESSION"
    elif 20 <= percentile < 80:
        return "NORMAL_VOLATILITY"
    return "HIGH_VOLATILITY_EXPANSION"

def get_range_trend_discriminator(bb_width_current, bb_width_history):
    if len(bb_width_history) == 0 or pd.isna(bb_width_current):
        return "RANGING"
        
    percentile = (bb_width_history < bb_width_current).mean() * 100
    if percentile < 25:
        return "RANGING"
    return "TRENDING_EXPANDING"

def calculate_regime_score(regime_h4, regime_h1):
    def map_regime(regime):
        if regime == "TRENDING_UP": return 1
        elif regime == "TRENDING_DOWN": return -1
        return 0
    
    score = (0.6 * map_regime(regime_h4)) + (0.4 * map_regime(regime_h1))
    
    if score >= 0.5:
        return "TRENDING_UP", score
    elif score <= -0.5:
        return "TRENDING_DOWN", score
    return "RANGING", score

def process_regime_dataframe(df: pd.DataFrame, lookback=100):
    df = df.copy()
    
    adx_df = ta.adx(df['high'], df['low'], df['close'], length=14)
    if adx_df is not None:
        df['ADX_14'] = adx_df['ADX_14']
        df['DMP_14'] = adx_df['DMP_14']
        df['DMN_14'] = adx_df['DMN_14']
    else:
        df['ADX_14'] = df['DMP_14'] = df['DMN_14'] = pd.NA
    
    df['ATR_14'] = ta.atr(df['high'], df['low'], df['close'], length=14)
    
    bb_df = ta.bbands(df['close'], length=20, std=2)
    if bb_df is not None:
        df['BBL_20_2.0'] = bb_df['BBL_20_2.0']
        df['BBM_20_2.0'] = bb_df['BBM_20_2.0']
        df['BBU_20_2.0'] = bb_df['BBU_20_2.0']
        df['BB_WIDTH'] = (df['BBU_20_2.0'] - df['BBL_20_2.0']) / df['BBM_20_2.0']
    else:
        df['BB_WIDTH'] = pd.NA
    
    latest = df.iloc[-1]
    history_100 = df.iloc[-lookback-1:-1]
    
    trend_strength, trend_dir = calculate_trend_strength(latest.get('ADX_14'), latest.get('DMP_14'), latest.get('DMN_14'))
    volatility = get_volatility_state(latest.get('ATR_14'), history_100['ATR_14'])
    discriminator = get_range_trend_discriminator(latest.get('BB_WIDTH'), history_100['BB_WIDTH'])
    
    if trend_strength in ["STRONG_TREND", "VERY_STRONG_TREND"] and discriminator == "TRENDING_EXPANDING":
        regime = f"TRENDING_{trend_dir}"
    else:
        regime = "RANGING"
        
    bb_percentile = (history_100['BB_WIDTH'] < latest.get('BB_WIDTH')).mean() * 100 if len(history_100) > 0 else 50.0
        
    return {
        "regime": regime,
        "adx": latest.get('ADX_14'),
        "volatility_state": volatility,
        "bb_width_percentile": bb_percentile
    }

def get_latest(symbol: str, df_h4: pd.DataFrame = None, df_h1: pd.DataFrame = None):
    if df_h4 is None or df_h1 is None:
        return {
            "symbol": symbol,
            "regime": "RANGING",
            "regime_score": 0.0,
            "volatility_state": "NORMAL_VOLATILITY",
            "adx_h4": 0.0,
            "adx_h1": 0.0,
            "bb_width_percentile": 50.0,
            "confidence_regime": 0.0
        }
        
    regime_h4_data = process_regime_dataframe(df_h4)
    regime_h1_data = process_regime_dataframe(df_h1)
    
    regime, score = calculate_regime_score(regime_h4_data['regime'], regime_h1_data['regime'])
    
    confidence_regime = 1.0 - abs(score - round(score))
    
    return {
        "symbol": symbol,
        "regime": regime,
        "regime_score": score,
        "volatility_state": regime_h1_data['volatility_state'],
        "adx_h4": float(regime_h4_data['adx']) if pd.notna(regime_h4_data['adx']) else 0.0,
        "adx_h1": float(regime_h1_data['adx']) if pd.notna(regime_h1_data['adx']) else 0.0,
        "bb_width_percentile": float(regime_h1_data['bb_width_percentile']),
        "confidence_regime": confidence_regime
    }
