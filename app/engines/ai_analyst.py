import json
import os
import urllib.request
import urllib.error
from typing import Any

def calculate_technical_metrics(candles: list[dict[str, Any]]) -> dict[str, Any]:
    if not candles or len(candles) < 5:
        return {}

    closes = [float(c.get("close", 0)) for c in candles if float(c.get("close", 0)) > 0]
    highs = [float(c.get("high", 0)) for c in candles if float(c.get("high", 0)) > 0]
    lows = [float(c.get("low", 0)) for c in candles if float(c.get("low", 0)) > 0]

    if not closes:
        return {}

    last_close = closes[-1]
    high_20 = max(highs[-20:]) if len(highs) >= 20 else max(highs)
    low_20 = min(lows[-20:]) if len(lows) >= 20 else min(lows)

    # Calculate Simple Moving Average (20)
    sma_20 = sum(closes[-20:]) / min(len(closes), 20)

    # Calculate Exponential Moving Average (14)
    multiplier = 2 / (14 + 1)
    ema_14 = closes[0]
    for price in closes[1:]:
        ema_14 = (price - ema_14) * multiplier + ema_14

    # ATR approximation over last 14 candles
    tr_list = []
    for i in range(1, min(len(candles), 15)):
        h = float(candles[i].get("high", 0))
        l = float(candles[i].get("low", 0))
        prev_c = float(candles[i - 1].get("close", 0))
        tr = max(h - l, abs(h - prev_c), abs(l - prev_c))
        tr_list.append(tr)

    atr = (sum(tr_list) / len(tr_list)) if tr_list else (high_20 - low_20) * 0.05
    if atr == 0:
        atr = last_close * 0.002

    return {
        "last_close": last_close,
        "high_20": high_20,
        "low_20": low_20,
        "sma_20": round(sma_20, 5),
        "ema_14": round(ema_14, 5),
        "atr": round(atr, 5),
    }


def analyze_market_chart(
    symbol: str,
    interval: str,
    candles: list[dict[str, Any]],
    account: dict[str, Any] | None = None,
) -> dict[str, Any]:
    metrics = calculate_technical_metrics(candles)
    if not metrics:
        return {
            "symbol": symbol,
            "interval": interval,
            "bias": "WAIT",
            "confidence": 50,
            "rationale": ["Data candle tidak mencukupi untuk analisis teknikal."],
            "scenarios": None,
            "chart_overlays": [],
            "provider": "system_fallback",
        }

    last_close = metrics["last_close"]
    high_20 = metrics["high_20"]
    low_20 = metrics["low_20"]
    sma_20 = metrics["sma_20"]
    ema_14 = metrics["ema_14"]
    atr = metrics["atr"]

    # Check for Gemini API key
    gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if gemini_key:
        try:
            return call_gemini_analysis(symbol, interval, metrics, candles, gemini_key)
        except Exception:
            # Fall back seamlessly to deterministic synthesis if API call fails
            pass

    # Deterministic technical analysis synthesis
    trend_up = last_close > ema_14 and last_close > sma_20
    trend_down = last_close < ema_14 and last_close < sma_20

    if trend_up:
        bias = "LONG"
        confidence = 82
        entry_low = round(last_close - (atr * 0.3), 2 if "XAU" in symbol else 5)
        entry_high = round(last_close + (atr * 0.2), 2 if "XAU" in symbol else 5)
        stop_loss = round(low_20 - (atr * 0.5), 2 if "XAU" in symbol else 5)
        tp1 = round(last_close + (abs(last_close - stop_loss) * 1.5), 2 if "XAU" in symbol else 5)
        tp2 = round(last_close + (abs(last_close - stop_loss) * 2.5), 2 if "XAU" in symbol else 5)
        rationale = [
            f"Harga {last_close} bertahan di atas EMA-14 ({ema_14}) dan SMA-20 ({sma_20}), mengindikasikan struktur bullish.",
            f"Support kunci berada pada swing low {low_20}, dengan batas invalidsasi SL di {stop_loss}.",
            f"Target ekspansi Fibonacci / RR 1:1.5 mengarah ke resistance {tp1}.",
        ]
    elif trend_down:
        bias = "SHORT"
        confidence = 78
        entry_low = round(last_close - (atr * 0.2), 2 if "XAU" in symbol else 5)
        entry_high = round(last_close + (atr * 0.3), 2 if "XAU" in symbol else 5)
        stop_loss = round(high_20 + (atr * 0.5), 2 if "XAU" in symbol else 5)
        tp1 = round(last_close - (abs(stop_loss - last_close) * 1.5), 2 if "XAU" in symbol else 5)
        tp2 = round(last_close - (abs(stop_loss - last_close) * 2.5), 2 if "XAU" in symbol else 5)
        rationale = [
            f"Harga {last_close} berada di bawah EMA-14 ({ema_14}) dan SMA-20 ({sma_20}), menunjukkan tekanan bearish.",
            f"Resistance kunci pada swing high {high_20}, dengan batas invalidasi SL di {stop_loss}.",
            f"Target penurunan RR 1:1.5 mengarah ke support {tp1}.",
        ]
    else:
        bias = "WAIT"
        confidence = 60
        entry_low = round(last_close - (atr * 0.5), 2 if "XAU" in symbol else 5)
        entry_high = round(last_close + (atr * 0.5), 2 if "XAU" in symbol else 5)
        stop_loss = round(low_20 - (atr * 0.5), 2 if "XAU" in symbol else 5)
        tp1 = round(high_20, 2 if "XAU" in symbol else 5)
        tp2 = round(high_20 + atr, 2 if "XAU" in symbol else 5)
        rationale = [
            f"Harga konsolidasi di rentang {low_20} – {high_20}, di antara EMA-14 ({ema_14}) dan SMA-20 ({sma_20}).",
            "Disarankan menunggu konfirmasi breakout sebelum mengambil posisi.",
        ]

    chart_overlays = [
        {"type": "resistance", "label": "Key Resistance", "price": high_20, "style": "dashed", "color": "#f59e0b"},
        {"type": "support", "label": "Key Support", "price": low_20, "style": "dashed", "color": "#3b82f6"},
        {"type": "stop_loss", "label": "Stop Loss (SL)", "price": stop_loss, "style": "solid", "color": "#f43f5e"},
        {"type": "take_profit", "label": "Target TP1", "price": tp1, "style": "solid", "color": "#10b981"},
    ]

    return {
        "symbol": symbol,
        "interval": interval.upper(),
        "bias": bias,
        "confidence": confidence,
        "rationale": rationale,
        "scenarios": {
            "main": {
                "direction": bias,
                "entry_min": entry_low,
                "entry_max": entry_high,
                "stop_loss": stop_loss,
                "take_profit_1": tp1,
                "take_profit_2": tp2,
                "rr_ratio": 1.5,
            }
        },
        "chart_overlays": chart_overlays,
        "provider": "deterministic_engine",
    }


def call_gemini_analysis(
    symbol: str,
    interval: str,
    metrics: dict[str, Any],
    candles: list[dict[str, Any]],
    api_key: str,
) -> dict[str, Any]:
    model_name = os.environ.get("GEMINI_MODEL", "gemini-flash-lite-latest")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
    prompt_text = (
        f"You are an expert AI trading analyst. Analyze the following market metrics for {symbol} ({interval}):\n"
        f"Metrics: {json.dumps(metrics)}\n"
        "Return ONLY a JSON object with keys: bias (LONG/SHORT/WAIT), confidence (integer 0-100), "
        "rationale (array of 3 strings explaining technical reasons in Indonesian), "
        "scenarios (object with main scenario containing direction, entry_min, entry_max, stop_loss, take_profit_1, take_profit_2, rr_ratio)."
    )
    payload = json.dumps({
        "contents": [{"parts": [{"text": prompt_text}]}],
        "generationConfig": {"response_mime_type": "application/json"},
    }).encode("utf-8")

    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        res_data = json.loads(resp.read().decode("utf-8"))
        text_content = res_data["candidates"][0]["content"]["parts"][0]["text"]
        parsed = json.loads(text_content)
        parsed["symbol"] = symbol
        parsed["interval"] = interval.upper()
        parsed["provider"] = "gemini_cloud"

        # Normalize scenarios.main
        sc = parsed.get("scenarios")
        if isinstance(sc, dict) and "main" not in sc:
            direction = sc.get("direction") or sc.get("main_scenario_direction") or parsed.get("bias", "WAIT")
            sc["main"] = {
                "direction": direction,
                "entry_min": sc.get("entry_min"),
                "entry_max": sc.get("entry_max"),
                "stop_loss": sc.get("stop_loss"),
                "take_profit_1": sc.get("take_profit_1"),
                "take_profit_2": sc.get("take_profit_2"),
                "rr_ratio": sc.get("rr_ratio", 1.5),
            }

        if "chart_overlays" not in parsed or not parsed["chart_overlays"]:
            overlays = []
            if "high_20" in metrics:
                overlays.append({"type": "resistance", "label": "Key Resistance", "price": metrics["high_20"], "style": "dashed", "color": "#f59e0b"})
            if "low_20" in metrics:
                overlays.append({"type": "support", "label": "Key Support", "price": metrics["low_20"], "style": "dashed", "color": "#3b82f6"})
            main_sc = parsed.get("scenarios", {}).get("main") if isinstance(parsed.get("scenarios"), dict) else None
            if main_sc and main_sc.get("stop_loss"):
                overlays.append({"type": "stop_loss", "label": "Stop Loss (SL)", "price": main_sc["stop_loss"], "style": "solid", "color": "#f43f5e"})
            if main_sc and main_sc.get("take_profit_1"):
                overlays.append({"type": "take_profit", "label": "Target TP1", "price": main_sc["take_profit_1"], "style": "solid", "color": "#10b981"})
            parsed["chart_overlays"] = overlays

        return parsed
