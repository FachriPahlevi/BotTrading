import math
from typing import Any

from app.engines.agents.models import PlanModel


def validate_plan_direction_levels(
    direction: str, entry: float, sl: float, tp1: float
) -> list[str]:
    """Validates directional level hierarchy for SL and TP."""
    issues = []
    norm_dir = direction.upper()
    if norm_dir in {"LONG", "BUY"}:
        if sl >= entry:
            issues.append(f"SL ({sl}) harus lebih rendah dari Entry ({entry}) untuk posisi LONG.")
        if tp1 <= entry:
            issues.append(f"TP1 ({tp1}) harus lebih tinggi dari Entry ({entry}) untuk posisi LONG.")
    elif norm_dir in {"SHORT", "SELL"}:
        if sl <= entry:
            issues.append(f"SL ({sl}) harus lebih tinggi dari Entry ({entry}) untuk posisi SHORT.")
        if tp1 >= entry:
            issues.append(f"TP1 ({tp1}) harus lebih rendah dari Entry ({entry}) untuk posisi SHORT.")
    else:
        issues.append(f"Arah rencana tidak dapat dieksekusi ({direction}).")
    return issues


def validate_plan_risk_parameters(
    entry: float, sl: float, tp1: float, current_price: float, atr: float
) -> list[str]:
    """Validates ATR distance boundaries and risk-reward ratio."""
    issues = []
    max_dist = max(atr * 15.0, current_price * 0.15)
    if abs(entry - current_price) > max_dist:
        issues.append(f"Entry ({entry}) terlalu jauh dari harga pasar ({current_price}).")

    sl_dist = abs(entry - sl)
    tp_dist = abs(tp1 - entry)
    if sl_dist <= 0:
        issues.append("Jarak Stop Loss tidak boleh nol.")
    elif sl_dist > max_dist:
        issues.append("Jarak Stop Loss melebihi batas toleransi risiko wajar.")

    if sl_dist > 0 and (tp_dist / sl_dist) < 0.95:
        issues.append(f"Rasio Risk/Reward ({round(tp_dist / sl_dist, 2)}) di bawah batas minimum 1:1.0.")

    return issues


def validate_agent_plan(
    plan: PlanModel | None, current_price: float, metrics: dict[str, Any]
) -> tuple[bool, list[str]]:
    """Deterministically validates an agent's trading plan per R7 rule."""
    if not plan:
        return False, ["Rencana trading tidak disediakan."]

    entry = plan.entry_min if plan.entry_min > 0 else (plan.entry_max if plan.entry_max > 0 else 0.0)
    sl = plan.stop_loss
    tp1 = plan.take_profit_1

    for name, val in [("Entry", entry), ("Stop Loss", sl), ("Take Profit 1", tp1)]:
        if not math.isfinite(val) or val <= 0:
            return False, [f"Level {name} ({val}) tidak valid atau bernilai nol."]

    issues = validate_plan_direction_levels(plan.direction, entry, sl, tp1)
    atr = float(metrics.get("atr") or (current_price * 0.005))
    issues.extend(validate_plan_risk_parameters(entry, sl, tp1, current_price, atr))

    return len(issues) == 0, issues


def evaluate_decision_gate(
    bias: str | None,
    plan: PlanModel | None,
    plan_valid: bool,
    metrics: dict[str, Any],
) -> tuple[str, bool, list[str]]:
    """Evaluates deterministic execution gate per R10 rule."""
    reasons = []
    norm_bias = (bias or "WAIT").upper()

    if norm_bias not in {"LONG", "SHORT", "BUY", "SELL"}:
        return "WAIT", False, ["Bias pasar berstatus WAIT / NETRAL."]

    if not plan or not plan_valid:
        return "WAIT", False, ["Rencana trading tidak lolos validasi parameter risiko."]

    last_close = metrics.get("last_close", 0)
    sma_20 = metrics.get("sma_20", last_close)

    if norm_bias in {"LONG", "BUY"} and last_close < (sma_20 * 0.96):
        reasons.append("Harga berada terlalu jauh di bawah SMA-20 untuk entri buy.")

    if norm_bias in {"SHORT", "SELL"} and last_close > (sma_20 * 1.04):
        reasons.append("Harga berada terlalu jauh di atas SMA-20 untuk entri sell.")

    if reasons:
        return "WAIT", False, reasons

    return "TRADE", True, ["Semua kriteria validasi gerbang trading terpenuhi."]
