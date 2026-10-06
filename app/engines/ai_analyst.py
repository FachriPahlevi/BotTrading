import math
from datetime import datetime, timezone
from typing import Any

from app.engines.agents.metrics import calculate_technical_metrics
from app.engines.agents.models import AnalysisContext
from app.engines.agents.orchestrator import MultiAgentOrchestrator
from app.engines.agents.registry import get_available_agents_summary
from app.engines.agents.validation import evaluate_decision_gate


def build_insufficient_data_response(symbol: str, interval: str) -> dict[str, Any]:
    """Builds explicit response when candle data is below minimum threshold per R1 rule."""
    return {
        "symbol": symbol,
        "interval": interval.upper(),
        "status": "insufficient_data",
        "bias": "WAIT",
        "decision": "WAIT",
        "tradable": False,
        "confidence": 0,
        "primary_agent": None,
        "last_price": None,
        "summary": "Data candle tidak mencukupi untuk analisis teknikal.",
        "conclusion": "Data candle tidak mencukupi untuk analisis teknikal.",
        "fundamental": None,
        "technical": None,
        "volume": None,
        "seasonality_and_timing": None,
        "invalidation": None,
        "scenarios": None,
        "plans": [],
        "chart_overlays": [],
        "rationale": ["Data candle tidak mencukupi untuk analisis teknikal."],
        "provider": "system",
        "provider_id": "system",
        "provider_name": "Sistem Internal",
        "multi_agent": False,
        "consensus": None,
        "agent_results": {},
        "available_agents": get_available_agents_summary(),
        "selected_agents": [],
        "visual_data": None,
    }


def _format_candle_time(raw_time: Any, idx: int) -> str:
    """Safely formats raw candle timestamp (seconds, ms, ISO str, or fallback) to UTC string."""
    if raw_time is None:
        return f"Bar {idx + 1}"
    try:
        if isinstance(raw_time, (int, float)):
            t = float(raw_time)
            if t > 1e11:  # Milliseconds epoch
                t = t / 1000.0
            if 1e8 <= t <= 32503680000:
                return datetime.fromtimestamp(t, tz=timezone.utc).strftime("%d %b %H:%M")
        elif isinstance(raw_time, str):
            try:
                t = float(raw_time)
                if t > 1e11:
                    t = t / 1000.0
                if 1e8 <= t <= 32503680000:
                    return datetime.fromtimestamp(t, tz=timezone.utc).strftime("%d %b %H:%M")
            except ValueError:
                dt = datetime.fromisoformat(raw_time.replace("Z", "+00:00"))
                return dt.strftime("%d %b %H:%M")
    except (OSError, ValueError, OverflowError):
        pass
    return f"Bar {idx + 1}"


def _build_real_visual_data(
    candles: list[dict[str, Any]], metrics: dict[str, Any], current_price: float
) -> dict[str, Any]:
    """Generates chart overlays and labels strictly from real closed market candles."""
    recent_bars = candles[-25:] if len(candles) >= 25 else candles
    high_20 = metrics.get("high_20", current_price)
    low_20 = metrics.get("low_20", current_price)

    candles_sample = [
        [
            _format_candle_time(c.get("time"), idx),
            float(c.get("open", 0)),
            float(c.get("high", 0)),
            float(c.get("low", 0)),
            float(c.get("close", 0)),
        ]
        for idx, c in enumerate(recent_bars)
    ]

    last_idx = max(0, len(recent_bars) - 1)
    zones = [
        {"label": f"Resistance Area ({high_20})", "high": high_20, "low": round(high_20 * 0.998, 2), "start_idx": max(0, last_idx - 10), "color": "#ef5350", "opacity": 0.18},
        {"label": f"Support Area ({low_20})", "high": round(low_20 * 1.002, 2), "low": low_20, "start_idx": max(0, last_idx - 10), "color": "#26a69a", "opacity": 0.20},
    ]

    horizontal_levels = [
        {"price": high_20, "label": f"High {high_20}", "color": "#ef5350", "style": "dashed"},
        {"price": low_20, "label": f"Low {low_20}", "color": "#26a69a", "style": "dashed"},
    ]

    pattern_labels = [
        {"x_idx": 0, "y": high_20, "text": f"High {high_20}", "color": "#ef5350"},
        {"x_idx": last_idx, "y": current_price, "text": f"Kini {current_price}", "color": "#2962ff"},
    ]

    return {
        "zones": zones,
        "horizontal_levels": horizontal_levels,
        "pattern_labels": pattern_labels,
        "candles_sample": candles_sample,
    }


def _build_chart_overlays(plan: Any, high_20: float, low_20: float) -> list[dict[str, Any]]:
    """Builds chart overlay indicators for resistance, support, SL, and TP."""
    overlays = [
        {"type": "resistance", "label": f"Resistance ({high_20})", "price": high_20, "style": "dashed", "color": "#f59e0b"},
        {"type": "support", "label": f"Support ({low_20})", "price": low_20, "style": "dashed", "color": "#3b82f6"},
    ]
    if plan:
        if getattr(plan, "stop_loss", 0) > 0:
            overlays.append({"type": "stop_loss", "label": f"SL ({plan.stop_loss})", "price": plan.stop_loss, "style": "solid", "color": "#f43f5e"})
        if getattr(plan, "entry_min", 0) > 0:
            overlays.append({"type": "entry", "label": f"Entry ({plan.entry_min})", "price": plan.entry_min, "style": "solid", "color": "#f59e0b"})
        if getattr(plan, "take_profit_1", 0) > 0:
            overlays.append({"type": "take_profit", "label": f"TP1 ({plan.take_profit_1})", "price": plan.take_profit_1, "style": "solid", "color": "#10b981"})
    return overlays


def _format_strategy_plans(primary_plan: Any, current_price: float, bias: str) -> list[dict[str, Any]]:
    """Converts primary plan into list of strategy plans for UI consumption."""
    if not primary_plan:
        return []
    entry = primary_plan.entry_min if primary_plan.entry_min > 0 else current_price
    sl = primary_plan.stop_loss
    tp1 = primary_plan.take_profit_1
    tp2 = primary_plan.take_profit_2
    rr = primary_plan.rr_ratio

    price_path = [
        [0, entry],
        [1.5, entry],
        [3.0, tp1 if tp1 > 0 else entry],
    ]
    return [
        {
            "id": primary_plan.id,
            "name": primary_plan.name,
            "direction": primary_plan.direction,
            "trigger": primary_plan.trigger or "Konfirmasi candle pasar",
            "entry": entry,
            "stop_loss": sl,
            "take_profit_1": tp1,
            "take_profit_2": tp2,
            "rr_ratio": rr,
            "is_main": True,
            "notes": primary_plan.notes or f"Rencana trading arah {bias}.",
            "price_path": price_path,
        }
    ]


def _format_agent_results_dict(agent_results: dict[str, Any]) -> dict[str, Any]:
    """Serializes agent results for JSON payload without internal objects."""
    res_dict = {}
    for aid, res in agent_results.items():
        res_dict[aid] = res.model_dump() if hasattr(res, "model_dump") else res
    return res_dict


def _build_main_scenario(plan: Any) -> dict[str, Any] | None:
    """Builds main scenario summary dict from primary plan."""
    if not plan:
        return None
    rr_num = float(plan.rr_ratio.split(":")[-1]) if ":" in plan.rr_ratio else 1.5
    return {
        "direction": plan.direction,
        "entry_min": plan.entry_min,
        "entry_max": plan.entry_max,
        "stop_loss": plan.stop_loss,
        "take_profit_1": plan.take_profit_1,
        "take_profit_2": plan.take_profit_2,
        "rr_ratio": rr_num,
    }


def _compute_confidence_score(primary_res: Any, bias: str) -> int:
    """Calculates integer confidence score from primary agent."""
    raw_conf = primary_res.agent_confidence
    if raw_conf is not None and math.isfinite(raw_conf):
        return round(raw_conf)
    return 50 if bias == "WAIT" else 0


def _build_narrative_dict(
    symbol: str, interval: str, bias: str, current_price: float, primary_res: Any
) -> dict[str, Any]:
    """Builds narrative fields for final response."""
    return {
        "summary": primary_res.summary or f"Analisis {symbol} ({interval.upper()}) berarah {bias}.",
        "conclusion": primary_res.conclusion or f"Analisis teknikal {symbol} berarah {bias}.",
        "rationale": primary_res.rationale or [f"Struktur tren pasar berarah {bias}."],
        "technical": primary_res.technical or [f"Harga pasar berada di {current_price}."],
    }


def _assemble_final_payload(
    symbol: str,
    interval: str,
    orch_result: dict[str, Any],
    metrics: dict[str, Any],
    candles: list[dict[str, Any]],
) -> dict[str, Any]:
    """Assembles final UI-compatible dictionary from orchestrator results."""
    primary_res = orch_result["primary_result"]
    primary_plan = primary_res.plan
    bias = (primary_res.bias or "WAIT").upper()
    current_price = float(metrics["last_close"])
    high_20 = metrics.get("high_20", current_price)
    low_20 = metrics.get("low_20", current_price)

    decision, tradable, _ = evaluate_decision_gate(bias, primary_plan, primary_res.plan_valid, metrics)
    conf_val = _compute_confidence_score(primary_res, bias)
    narrative = _build_narrative_dict(symbol, interval, bias, current_price, primary_res)

    plans = _format_strategy_plans(primary_plan, current_price, bias)
    overlays = _build_chart_overlays(primary_plan, high_20, low_20)
    visual_data = _build_real_visual_data(candles, metrics, current_price)
    main_sc = _build_main_scenario(primary_plan)
    consensus_dict = orch_result["consensus"].model_dump() if orch_result["consensus"] else None

    return {
        "symbol": symbol,
        "interval": interval.upper(),
        "status": primary_res.status,
        "decision": decision,
        "tradable": tradable,
        "bias": bias,
        "confidence": conf_val,
        "primary_agent": orch_result["primary_agent"],
        "provider": primary_res.agent_id,
        "provider_id": primary_res.agent_id,
        "provider_name": primary_res.provider_name or primary_res.agent_id,
        "last_price": current_price,
        **narrative,
        "fundamental": None,  # R6: null unless verified external news source attached
        "volume": None,
        "seasonality_and_timing": None,
        "invalidation": primary_plan.invalidation if primary_plan else None,
        "plans": plans,
        "scenarios": {"main": main_sc} if main_sc else None,
        "chart_overlays": overlays,
        "visual_data": visual_data,
        "key_resistance": primary_res.key_resistance or str(high_20),
        "key_support": primary_res.key_support or str(low_20),
        "multi_agent": True,
        "selected_agents": orch_result["selected_agents"],
        "available_agents": orch_result["available_agents"],
        "consensus": consensus_dict,
        "agent_results": _format_agent_results_dict(orch_result["agent_results"]),
    }


def analyze_market_chart(
    symbol: str,
    interval: str,
    candles: list[dict[str, Any]],
    agents: list[str] | str | None = None,
    account: dict[str, Any] | None = None,
    force: bool = False,
    orchestrator: MultiAgentOrchestrator | None = None,
) -> dict[str, Any]:
    """Analyzes market using configured AI agents with honest metrics and no hardcoded fallback."""
    metrics = calculate_technical_metrics(candles)
    if not metrics or len(candles) < 5:
        return build_insufficient_data_response(symbol, interval)

    context = AnalysisContext(
        symbol=symbol,
        interval=interval.upper(),
        now_utc=datetime.now(timezone.utc).isoformat(),
        current_price=float(metrics["last_close"]),
        closed_candles=candles,
        metrics=metrics,
        account=account,
    )
    orch = orchestrator or MultiAgentOrchestrator()
    orch_result = orch.run_analysis(context, agents=agents, force=force)
    return _assemble_final_payload(symbol, interval, orch_result, metrics, candles)
