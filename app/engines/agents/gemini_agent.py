import json
import logging
import os
import time
from typing import Any

from app.engines.agents.http_client import HttpClient, default_http_post
from app.engines.agents.models import AgentResult
from app.engines.agents.parser import parse_llm_json_payload
from app.engines.agents.prompts import ANALYST_SYSTEM_PROMPT, build_analysis_user_prompt

logger = logging.getLogger("ai_analyst.gemini")


class GeminiAgent:
    """Agent that queries Google Gemini API using injected HTTP client and header authentication."""

    agent_id: str = "gemini"
    provider_name: str = "Google Gemini AI"

    def __init__(self, http_client: HttpClient | None = None, api_key: str | None = None) -> None:
        self.http_client = http_client or default_http_post
        self.api_key = api_key

    def _get_api_key(self) -> str:
        if self.api_key is not None:
            return self.api_key.strip()
        return os.environ.get("GEMINI_API_KEY", "").strip()

    def _build_request_body(self, context: Any) -> bytes:
        prompt_text = (
            f"{ANALYST_SYSTEM_PROMPT}\n\n"
            f"{build_analysis_user_prompt(context.symbol, context.interval, context.current_price, json.dumps(context.metrics))}"
        )
        return json.dumps({
            "contents": [{"parts": [{"text": prompt_text}]}],
            "generationConfig": {"response_mime_type": "application/json", "temperature": 0.2},
        }).encode("utf-8")

    def analyze(self, context: Any) -> AgentResult:
        key = self._get_api_key()
        if not key:
            return AgentResult(agent_id=self.agent_id, status="skipped", error_code="no_key", summary="Kunci API Gemini tidak dikonfigurasi.", provider_name=self.provider_name)

        model_name = os.environ.get("GEMINI_MODEL", "gemini-1.5-flash").strip()
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent"
        payload = self._build_request_body(context)
        headers = {"Content-Type": "application/json", "x-goog-api-key": key}

        t0 = time.perf_counter()
        try:
            status_code, resp_bytes = self.http_client(url, headers, payload, 10.0)
            latency_ms = int((time.perf_counter() - t0) * 1000)

            if status_code >= 500:
                return AgentResult(
                    agent_id=self.agent_id,
                    status="failed",
                    error_code="http_5xx",
                    summary="Layanan Google Gemini sedang sibuk atau mengalami gangguan server.",
                    latency_ms=latency_ms,
                    model=model_name,
                )
            if status_code >= 400:
                err_msg = "Permintaan ditolak oleh Google Gemini API (Bad Request / Invalid Key)."
                if status_code in (401, 403):
                    err_msg = "Kunci API Gemini tidak valid atau izin ditolak. Pastikan menggunakan API Key dari Google AI Studio (format AIzaSy...)."
                elif status_code == 404:
                    err_msg = f"Model '{model_name}' tidak ditemukan atau belum aktif untuk API Key ini."
                elif status_code == 429:
                    err_msg = "Batas kuota harian (rate limit) Google Gemini terlampaui."
                return AgentResult(
                    agent_id=self.agent_id,
                    status="failed",
                    error_code="http_4xx",
                    summary=err_msg,
                    latency_ms=latency_ms,
                    model=model_name,
                )

            parsed_resp = json.loads(resp_bytes.decode("utf-8"))
            candidate_text = parsed_resp["candidates"][0]["content"]["parts"][0]["text"]
            content_json = json.loads(candidate_text)

            res = parse_llm_json_payload(content_json, self.agent_id, self.provider_name, context.current_price, context.metrics)
            res.model = model_name
            res.latency_ms = latency_ms
            return res

        except TimeoutError:
            return AgentResult(agent_id=self.agent_id, status="failed", error_code="timeout", model=model_name)
        except (json.JSONDecodeError, KeyError, IndexError) as err:
            logger.warning("Failed to parse Gemini response: %s", type(err).__name__)
            return AgentResult(agent_id=self.agent_id, status="failed", error_code="invalid_json", model=model_name)
        except (ConnectionError, OSError, ValueError, RuntimeError) as exc:
            logger.error("Network or runtime error in GeminiAgent: %s", type(exc).__name__)
            return AgentResult(agent_id=self.agent_id, status="failed", error_code="http_5xx", model=model_name)
