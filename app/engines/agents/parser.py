from typing import Any

from app.engines.agents.models import AgentResult, LevelModel, PlanModel
from app.engines.agents.prompts import PROMPT_VERSION
from app.engines.agents.validation import validate_agent_plan


def _extract_plan(data: dict[str, Any], bias: str, current_price: float) -> PlanModel | None:
    """Extracts and normalizes PlanModel from LLM raw dictionary."""
    plan_raw = data.get("plan")
    if not isinstance(plan_raw, dict) or not plan_raw:
        return None

    dir_val = str(plan_raw.get("direction", bias)).upper()
    norm_dir = "BUY" if dir_val in {"BUY", "LONG"} else ("SELL" if dir_val in {"SELL", "SHORT"} else "WAIT")

    tp2 = plan_raw.get("take_profit_2")
    return PlanModel(
        id="plan_a",
        name=f"A. Skenario Utama {norm_dir}",
        direction=norm_dir,
        entry_min=float(plan_raw.get("entry_min") or current_price),
        entry_max=float(plan_raw.get("entry_max") or current_price),
        stop_loss=float(plan_raw.get("stop_loss") or 0.0),
        take_profit_1=float(plan_raw.get("take_profit_1") or 0.0),
        take_profit_2=float(tp2) if tp2 is not None else None,
        trigger=str(plan_raw.get("trigger", "")),
        invalidation=str(plan_raw.get("invalidation", "")),
        is_main=True,
    )


def _extract_levels(data: dict[str, Any], metrics: dict[str, Any], current_price: float) -> list[LevelModel]:
    """Extracts support/resistance level models from LLM response."""
    levels = []
    if data.get("key_resistance"):
        levels.append(LevelModel(kind="resistance", price=metrics.get("high_20", current_price), label=str(data["key_resistance"])))
    if data.get("key_support"):
        levels.append(LevelModel(kind="support", price=metrics.get("low_20", current_price), label=str(data["key_support"])))
    return levels


def parse_llm_json_payload(
    data: dict[str, Any],
    agent_id: str,
    provider_name: str,
    current_price: float,
    metrics: dict[str, Any],
) -> AgentResult:
    """Parses raw LLM JSON dict into validated AgentResult model."""
    raw_bias = str(data.get("bias", "WAIT")).upper()
    bias = raw_bias if raw_bias in {"LONG", "SHORT", "WAIT"} else "WAIT"

    conf = data.get("confidence")
    agent_conf = float(conf) if conf is not None and isinstance(conf, (int, float)) else None

    plan = _extract_plan(data, bias, current_price)
    plan_valid, issues = validate_agent_plan(plan, current_price, metrics)
    levels = _extract_levels(data, metrics, current_price)

    return AgentResult(
        agent_id=agent_id,
        status="ok",
        error_code=None,
        prompt_version=PROMPT_VERSION,
        bias=bias,
        agent_confidence=agent_conf,
        summary=data.get("summary"),
        conclusion=data.get("conclusion"),
        rationale=data.get("rationale") or [],
        technical=data.get("technical") or [],
        levels=levels,
        plan=plan,
        plan_valid=plan_valid,
        plan_issues=issues,
        fundamental=None,
        key_resistance=str(data.get("key_resistance")) if data.get("key_resistance") else None,
        key_support=str(data.get("key_support")) if data.get("key_support") else None,
        provider_name=provider_name,
        kind="llm",
    )
