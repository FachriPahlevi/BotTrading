import json
import logging
import os
import time
from typing import Any

from app.engines.agents.http_client import HttpClient, default_http_post
from app.engines.agents.models import AgentResult
from app.engines.agents.parser import parse_llm_json_payload
from app.engines.agents.prompts import ANALYST_SYSTEM_PROMPT, build_analysis_user_prompt

logger = logging.getLogger("ai_analyst.claude")


def _clean_markdown_fence(raw_text: str) -> str:
    """Removes markdown code fences if model enclosed JSON response."""
    text = raw_text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    return text


class ClaudeAgent:
    """Agent that queries Anthropic Claude API using injected HTTP client and header authentication."""

    agent_id: str = "claude"
    provider_name: str = "Anthropic Claude"

    def __init__(self, http_client: HttpClient | None = None, api_key: str | None = None) -> None:
        self.http_client = http_client or default_http_post
        self.api_key = api_key

    def _get_api_key(self) -> str:
        if self.api_key is not None:
            return self.api_key.strip()
        return os.environ.get("ANTHROPIC_API_KEY", "").strip()

    def _build_request_body(self, context: Any, model_name: str) -> bytes:
        prompt_text = (
            f"{ANALYST_SYSTEM_PROMPT}\n\n"
            f"{build_analysis_user_prompt(context.symbol, context.interval, context.current_price, json.dumps(context.metrics))}"
        )
        return json.dumps({
            "model": model_name,
            "max_tokens": 1500,
            "temperature": 0.2,
            "messages": [{"role": "user", "content": prompt_text}],
        }).encode("utf-8")

    def analyze(self, context: Any) -> AgentResult:
        key = self._get_api_key()
        if not key:
            return AgentResult(agent_id=self.agent_id, status="skipped", error_code="no_key", summary="Kunci API Claude tidak dikonfigurasi.", provider_name=self.provider_name)

        model_name = os.environ.get("CLAUDE_MODEL", "claude-3-5-sonnet-20241022").strip()
        url = "https://api.anthropic.com/v1/messages"
        payload = self._build_request_body(context, model_name)
        headers = {"content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01"}

        t0 = time.perf_counter()
        try:
            status_code, resp_bytes = self.http_client(url, headers, payload, 12.0)
            latency_ms = int((time.perf_counter() - t0) * 1000)

            if status_code >= 500:
                return AgentResult(
                    agent_id=self.agent_id,
                    status="failed",
                    error_code="http_5xx",
                    summary="Layanan Anthropic Claude sedang sibuk atau mengalami gangguan server.",
                    latency_ms=latency_ms,
                    model=model_name,
                )
            if status_code >= 400:
                err_msg = "Permintaan ditolak oleh Anthropic Claude API."
                raw_err = resp_bytes.decode("utf-8", errors="ignore").lower()
                if "credit balance is too low" in raw_err:
                    err_msg = "Saldo kredit akun Anthropic Claude habis ($0 balance). Silakan isi saldo di Anthropic Console Plans & Billing."
                elif status_code in (401, 403):
                    err_msg = "Kunci API Anthropic Claude tidak valid atau izin ditolak."
                elif status_code == 429:
                    err_msg = "Batas kuota harian/rate limit Anthropic Claude terlampaui."
                return AgentResult(
                    agent_id=self.agent_id,
                    status="failed",
                    error_code="http_4xx",
                    summary=err_msg,
                    latency_ms=latency_ms,
                    model=model_name,
                )

            parsed_resp = json.loads(resp_bytes.decode("utf-8"))
            content_list = parsed_resp.get("content", [])
            text_blocks = [item.get("text", "") for item in content_list if item.get("type") == "text"]
            clean_text = _clean_markdown_fence("".join(text_blocks))
            content_json = json.loads(clean_text)

            res = parse_llm_json_payload(content_json, self.agent_id, self.provider_name, context.current_price, context.metrics)
            res.model = model_name
            res.latency_ms = latency_ms
            return res

        except TimeoutError:
            return AgentResult(agent_id=self.agent_id, status="failed", error_code="timeout", model=model_name)
        except (json.JSONDecodeError, KeyError, IndexError) as err:
            logger.warning("Failed to parse Claude response: %s", type(err).__name__)
            return AgentResult(agent_id=self.agent_id, status="failed", error_code="invalid_json", model=model_name)
        except (ConnectionError, OSError, ValueError, RuntimeError) as exc:
            logger.error("Network or runtime error in ClaudeAgent: %s", type(exc).__name__)
            return AgentResult(agent_id=self.agent_id, status="failed", error_code="http_5xx", model=model_name)
