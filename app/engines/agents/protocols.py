from typing import Protocol

from app.engines.agents.models import AgentResult, AnalysisContext


class MarketAgent(Protocol):
    agent_id: str

    def analyze(self, context: AnalysisContext) -> AgentResult:
        """Executes market analysis on given context and returns typed AgentResult."""
        ...
