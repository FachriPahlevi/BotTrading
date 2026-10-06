from typing import Any

from app.engines.agents.models import AgentResult, LevelModel, PlanModel
from app.engines.agents.validation import validate_agent_plan


def _build_trend_checks(
    last_close: float,
    high_20: float,
    low_20: float,
    sma_20: float,
    ema_10: float,
    ema_14: float,
    rsi: float | None,
    atr: float,
) -> tuple[list[tuple[bool, str]], list[tuple[bool, str]]]:
    """Generates rule checklists for long and short market conditions."""
    midpoint = (high_20 + low_20) / 2.0
    rsi_val = rsi if rsi is not None else 50.0

    long_checks = [
        (last_close > ema_14 and last_close > sma_20, "Harga di atas EMA-14 dan SMA-20"),
        (ema_10 >= ema_14, "EMA-10 berada di atas atau sama dengan EMA-14"),
        (last_close >= midpoint, "Harga berada pada paruh atas swing range"),
        (40.0 <= rsi_val <= 70.0, "RSI-14 berada dalam zona momentum sehat"),
        (atr > 0 and atr < (last_close * 0.08), "Volatilitas ATR berada dalam rentang wajar"),
    ]
    short_checks = [
        (last_close < ema_14 and last_close < sma_20, "Harga di bawah EMA-14 dan SMA-20"),
        (ema_10 <= ema_14, "EMA-10 berada di bawah atau sama dengan EMA-14"),
        (last_close <= midpoint, "Harga berada pada paruh bawah swing range"),
        (30.0 <= rsi_val <= 60.0, "RSI-14 berada dalam zona distribusi sehat"),
        (atr > 0 and atr < (last_close * 0.08), "Volatilitas ATR berada dalam rentang wajar"),
    ]
    return long_checks, short_checks


def _evaluate_trend_conditions(
    last_close: float,
    high_20: float,
    low_20: float,
    sma_20: float,
    ema_10: float,
    ema_14: float,
    rsi: float | None,
    atr: float,
) -> tuple[str, int, list[str]]:
    """Evaluates checklist and returns bias, score, and passed reasons."""
    long_checks, short_checks = _build_trend_checks(
        last_close, high_20, low_20, sma_20, ema_10, ema_14, rsi, atr
    )
    long_passed = [desc for p, desc in long_checks if p]
    short_passed = [desc for p, desc in short_checks if p]

    if len(long_passed) >= 3 and len(long_passed) > len(short_passed):
        return "LONG", round((len(long_passed) / len(long_checks)) * 100), long_passed
    if len(short_passed) >= 3 and len(short_passed) > len(long_passed):
        return "SHORT", round((len(short_passed) / len(short_checks)) * 100), short_passed
    return "WAIT", 50, ["Kondisi teknikal belum memenuhi ambang batas momentum konfirmasi."]


def _build_rule_plan(
    bias: str, last_close: float, high_20: float, low_20: float, atr: float
) -> PlanModel | None:
    """Constructs single deterministic trading plan based on active bias."""
    digits = 2 if last_close > 100 else 5
    safe_atr = max(atr, last_close * 0.002)

    if bias == "LONG":
        entry = round(last_close, digits)
        sl = round(max(0.0001, min(low_20, last_close - safe_atr * 1.0)), digits)
        sl_dist = abs(entry - sl)
        tp1 = round(entry + sl_dist * 1.5, digits)
        tp2 = round(entry + sl_dist * 2.5, digits)
        rr = round(abs(tp1 - entry) / max(0.0001, sl_dist), 1)
        return PlanModel(
            id="plan_a",
            name="A. Buy on Pullback / Trend Momentum",
            direction="BUY",
            entry_min=entry,
            entry_max=entry,
            stop_loss=sl,
            take_profit_1=tp1,
            take_profit_2=tp2,
            rr_ratio=f"1:{rr}",
            trigger=f"Konfirmasi candle di atas level {entry}",
            invalidation=f"Close candle di bawah Stop Loss {sl}",
            is_main=True,
            notes="Rencana deterministik berbasis konfirmasi rata-rata bergerak.",
        )

    if bias == "SHORT":
        entry = round(last_close, digits)
        sl = round(max(high_20, last_close + safe_atr * 1.0), digits)
        sl_dist = abs(sl - entry)
        tp1 = round(max(0.0001, entry - sl_dist * 1.5), digits)
        tp2 = round(max(0.0001, entry - sl_dist * 2.5), digits)
        rr = round(abs(entry - tp1) / max(0.0001, sl_dist), 1)
        return PlanModel(
            id="plan_a",
            name="A. Sell on Rally / Breakdown Momentum",
            direction="SELL",
            entry_min=entry,
            entry_max=entry,
            stop_loss=sl,
            take_profit_1=tp1,
            take_profit_2=tp2,
            rr_ratio=f"1:{rr}",
            trigger=f"Konfirmasi candle di bawah level {entry}",
            invalidation=f"Close candle di atas Stop Loss {sl}",
            is_main=True,
            notes="Rencana deterministik berbasis konfirmasi rata-rata bergerak.",
        )

    return None


class RuleBasedAgent:
    """Deterministic internal technical analysis agent with dynamic condition-based scoring."""

    agent_id: str = "rule_based"

    def analyze(self, context: Any) -> AgentResult:
        metrics = context.metrics
        last_close = float(metrics.get("last_close") or context.current_price)
        high_20 = float(metrics.get("high_20") or last_close)
        low_20 = float(metrics.get("low_20") or last_close)
        sma_20 = float(metrics.get("sma_20") or last_close)
        ema_10 = float(metrics.get("ema_10") or last_close)
        ema_14 = float(metrics.get("ema_14") or last_close)
        rsi = metrics.get("rsi_14")
        atr = float(metrics.get("atr") or (last_close * 0.005))

        bias, conf, reasons = _evaluate_trend_conditions(
            last_close, high_20, low_20, sma_20, ema_10, ema_14, rsi, atr
        )

        plan = _build_rule_plan(bias, last_close, high_20, low_20, atr)
        plan_valid, issues = validate_agent_plan(plan, last_close, metrics)

        levels = [
            LevelModel(kind="resistance", price=high_20, label=f"Swing High 20 ({high_20})"),
            LevelModel(kind="support", price=low_20, label=f"Swing Low 20 ({low_20})"),
        ]

        summary = (
            f"Analisis deterministik mendeteksi struktur {bias} pada {context.symbol} ({context.interval}) "
            f"dengan keyakinan {conf}% berdasarkan pemenuhan kondisi teknikal."
        )

        return AgentResult(
            agent_id=self.agent_id,
            status="ok",
            error_code=None,
            model="deterministic_rules_v1",
            prompt_version="v1",
            latency_ms=1,
            bias=bias,
            agent_confidence=conf,
            summary=summary,
            conclusion=f"Model deterministik mengonfirmasi arah {bias}. " + " ".join(reasons[:2]),
            rationale=reasons,
            technical=[
                f"Posisi harga: {last_close} terhadap SMA-20: {sma_20}",
                f"Level Swing High 20: {high_20}, Swing Low 20: {low_20}",
                f"Volatilitas ATR (Wilder): {atr}, RSI-14: {rsi if rsi is not None else 'N/A'}",
            ],
            levels=levels,
            plan=plan,
            plan_valid=plan_valid,
            plan_issues=issues,
            fundamental=None,
            key_resistance=str(high_20),
            key_support=str(low_20),
            provider_name="Sistem Analisis Internal (Rule-Based)",
            kind="deterministic",
        )
