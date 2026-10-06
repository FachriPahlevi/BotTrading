from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class AgentSpec:
    id: str
    display_name: str
    kind: str  # "llm" | "deterministic"
    provider: str  # "google" | "anthropic" | "internal"
    model_env: str
    key_env: str
    default_model: str
    enabled: bool = True
    description: str = ""


# Master catalog of supported agents (Single source of truth)
AGENT_CATALOG: list[AgentSpec] = [
    AgentSpec(
        id="gemini",
        display_name="Google Gemini AI",
        kind="llm",
        provider="google",
        model_env="GEMINI_MODEL",
        key_env="GEMINI_API_KEY",
        default_model="gemini-2.5-flash",
        enabled=True,
        description="Analisis makro & reasoning cepat Google GenAI",
    ),
    AgentSpec(
        id="claude",
        display_name="Anthropic Claude",
        kind="llm",
        provider="anthropic",
        model_env="CLAUDE_MODEL",
        key_env="ANTHROPIC_API_KEY",
        default_model="claude-3-5-sonnet-20241022",
        enabled=True,
        description="Penalaran struktural mendalam Anthropic",
    ),
    AgentSpec(
        id="rule_based",
        display_name="Sistem Internal (Rule-Based)",
        kind="deterministic",
        provider="internal",
        model_env="",
        key_env="",
        default_model="deterministic_rules_v1",
        enabled=True,
        description="Analisis teknikal deterministik matematis",
    ),
]


def get_agent_catalog() -> list[AgentSpec]:
    """Returns all registered agent specifications."""
    return [agent for agent in AGENT_CATALOG if agent.enabled]


def get_agent_spec(agent_id: str) -> AgentSpec | None:
    """Finds an agent spec by ID."""
    clean_id = agent_id.strip().lower()
    for spec in AGENT_CATALOG:
        if spec.id == clean_id:
            return spec
    return None


def get_available_agents_summary() -> list[dict[str, Any]]:
    """Builds a UI-ready summary list of available agents."""
    return [
        {
            "id": spec.id,
            "name": spec.display_name,
            "kind": spec.kind,
            "provider": spec.provider,
            "description": spec.description,
        }
        for spec in get_agent_catalog()
    ]
