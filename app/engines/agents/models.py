from typing import Any

from pydantic import BaseModel, Field


class LevelModel(BaseModel):
    kind: str  # "support" | "resistance"
    price: float
    label: str = ""


class PlanModel(BaseModel):
    id: str = "plan_a"
    name: str = "A. Skenario Utama"
    direction: str = "WAIT"  # "LONG" | "SHORT" | "WAIT"
    entry_min: float = 0.0
    entry_max: float = 0.0
    stop_loss: float = 0.0
    take_profit_1: float = 0.0
    take_profit_2: float | None = None
    take_profit_3: float | None = None
    rr_ratio: str = "1:2.0"
    trigger: str = ""
    invalidation: str = ""
    is_main: bool = True
    notes: str = ""
    price_path: list[list[float]] = Field(default_factory=list)


class AgentResult(BaseModel):
    agent_id: str
    status: str = "ok"  # "ok" | "failed" | "skipped"
    error_code: str | None = None  # "no_key" | "timeout" | "http_4xx" | "http_5xx" | "invalid_json" | "schema_invalid"
    model: str | None = None
    prompt_version: str = "v1"
    latency_ms: int = 0
    bias: str | None = None  # "LONG" | "SHORT" | "WAIT"
    agent_confidence: float | None = None
    summary: str | None = None
    conclusion: str | None = None
    rationale: list[str] = Field(default_factory=list)
    technical: list[str] = Field(default_factory=list)
    levels: list[LevelModel] = Field(default_factory=list)
    plan: PlanModel | None = None
    plan_valid: bool = True
    plan_issues: list[str] = Field(default_factory=list)
    fundamental: list[str] | None = None  # R6: null unless source connected
    key_resistance: str | None = None
    key_support: str | None = None
    provider_name: str = ""
    kind: str = "llm"  # "llm" | "deterministic"


class AnalysisContext(BaseModel):
    symbol: str
    interval: str
    now_utc: str
    current_price: float
    closed_candles: list[dict[str, Any]]
    metrics: dict[str, Any]
    account: dict[str, Any] | None = None


class ConsensusResult(BaseModel):
    bias: str
    agreement_ratio: str
    average_confidence: float
    votes: dict[str, int]
    total_agents: int
    summary: str
