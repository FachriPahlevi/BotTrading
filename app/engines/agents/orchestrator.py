import os
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from app.engines.agents.claude_agent import ClaudeAgent
from app.engines.agents.gemini_agent import GeminiAgent
from app.engines.agents.models import AgentResult, AnalysisContext, ConsensusResult
from app.engines.agents.protocols import MarketAgent
from app.engines.agents.registry import get_available_agents_summary
from app.engines.agents.rule_based_agent import RuleBasedAgent


def _tally_votes(ok_results: dict[str, AgentResult]) -> tuple[dict[str, int], list[float]]:
    """Tallies directional votes and collects confidences from successful agents."""
    votes = {"LONG": 0, "SHORT": 0, "WAIT": 0}
    confidences = []
    for res in ok_results.values():
        b = (res.bias or "WAIT").upper()
        if b in {"LONG", "BUY"}:
            votes["LONG"] += 1
        elif b in {"SHORT", "SELL"}:
            votes["SHORT"] += 1
        else:
            votes["WAIT"] += 1
        if res.agent_confidence is not None:
            confidences.append(float(res.agent_confidence))
    return votes, confidences


def _determine_consensus_bias(votes: dict[str, int]) -> tuple[str, int]:
    """Determines dominant bias and majority vote count."""
    if votes["LONG"] > votes["SHORT"] and votes["LONG"] >= votes["WAIT"]:
        return "BULLISH", votes["LONG"]
    if votes["SHORT"] > votes["LONG"] and votes["SHORT"] >= votes["WAIT"]:
        return "BEARISH", votes["SHORT"]
    return "NETRAL / WAIT", votes["WAIT"]


def calculate_honest_consensus(ok_results: dict[str, AgentResult]) -> ConsensusResult | None:
    """Calculates consensus strictly among agents with 'ok' status per R9 rule."""
    if len(ok_results) < 2:
        return None

    votes, confidences = _tally_votes(ok_results)
    consensus_bias, majority = _determine_consensus_bias(votes)

    total = len(ok_results)
    avg_conf = round(sum(confidences) / len(confidences), 1) if confidences else 50.0
    ratio = f"{majority}/{total}"

    summary = (
        f"Konsensus {ratio} agent yang aktif memvalidasi arah {consensus_bias} "
        f"dengan keyakinan rata-rata {avg_conf}%."
    )
    return ConsensusResult(
        bias=consensus_bias,
        agreement_ratio=ratio,
        average_confidence=avg_conf,
        votes=votes,
        total_agents=total,
        summary=summary,
    )


def _resolve_target_list(requested: list[str] | str | None, valid_agents: list[str]) -> list[str]:
    """Parses and sanitizes requested agent IDs."""
    if not requested or requested in ("all", ["all"], "*"):
        return ["gemini", "claude", "rule_based"]
    raw_list = requested.split(",") if isinstance(requested, str) else requested
    valid = [a.strip().lower() for a in raw_list if a and a.strip().lower() in valid_agents]
    return valid or ["rule_based"]


def _select_primary_agent(
    ok_results: dict[str, AgentResult],
    all_results: dict[str, AgentResult],
    target_ids: list[str],
) -> tuple[str, AgentResult]:
    """Selects primary agent according to preference order."""
    primary_pref = os.environ.get("AI_PRIMARY_AGENT", "gemini,claude,rule_based").split(",")
    for pref in [p.strip().lower() for p in primary_pref]:
        if pref in ok_results:
            return pref, ok_results[pref]
    if ok_results:
        first_ok = next(iter(ok_results.keys()))
        return first_ok, ok_results[first_ok]
    fallback_id = target_ids[0] if target_ids else "rule_based"
    return fallback_id, all_results.get(fallback_id, next(iter(all_results.values())))


class MultiAgentOrchestrator:
    """Orchestrates multi-agent analysis with thread pooling, cache, and honest consensus."""

    def __init__(self, custom_agents: dict[str, MarketAgent] | None = None) -> None:
        self._lock = threading.RLock()
        self._cache: dict[tuple[str, str, int, str], AgentResult] = {}
        self._agents: dict[str, MarketAgent] = custom_agents or {
            "gemini": GeminiAgent(),
            "claude": ClaudeAgent(),
            "rule_based": RuleBasedAgent(),
        }

    def _execute_single_agent(
        self, agent_id: str, context: AnalysisContext, bar_time: int, force: bool
    ) -> AgentResult:
        cache_key = (context.symbol, context.interval, bar_time, agent_id)
        if not force and bar_time > 0:
            with self._lock:
                if cache_key in self._cache:
                    return self._cache[cache_key]

        agent = self._agents.get(agent_id)
        if not agent:
            return AgentResult(agent_id=agent_id, status="failed", error_code="unknown_agent")

        res = agent.analyze(context)
        if res.status == "ok" and bar_time > 0:
            with self._lock:
                self._cache[cache_key] = res
        return res

    def run_analysis(
        self,
        context: AnalysisContext,
        agents: list[str] | str | None = None,
        force: bool = False,
    ) -> dict[str, Any]:
        """Runs requested agents concurrently and computes honest multi-agent consensus."""
        target_ids = _resolve_target_list(agents, list(self._agents.keys()))
        bar_time = 0
        if context.closed_candles:
            raw_t = context.closed_candles[-1].get("time", 0)
            try:
                bar_time = int(float(raw_t))
            except (ValueError, TypeError):
                bar_time = hash(str(raw_t)) & 0x7FFFFFFF

        agent_results: dict[str, AgentResult] = {}
        with ThreadPoolExecutor(max_workers=min(len(target_ids), 4)) as executor:
            future_to_id = {
                executor.submit(self._execute_single_agent, aid, context, bar_time, force): aid
                for aid in target_ids
            }
            for future in as_completed(future_to_id):
                aid = future_to_id[future]
                try:
                    agent_results[aid] = future.result()
                except (TimeoutError, ConnectionError, OSError, RuntimeError, ValueError):
                    agent_results[aid] = AgentResult(agent_id=aid, status="failed", error_code="timeout")

        ok_results = {k: v for k, v in agent_results.items() if v.status == "ok"}
        consensus = calculate_honest_consensus(ok_results)
        primary_id, primary_res = _select_primary_agent(ok_results, agent_results, target_ids)

        return {
            "primary_agent": primary_id,
            "primary_result": primary_res,
            "consensus": consensus,
            "agent_results": agent_results,
            "available_agents": get_available_agents_summary(),
            "selected_agents": target_ids,
        }
