"""Tóm tắt cuộc họp: Ollama /api/generate hoặc DashScope chat/completions."""

import json
import os
import re
import time

import requests

from src.prompt_privacy import mask_prompt_privacy, unmask_prompt_privacy

REMOTE_PROVIDERS = frozenset(
    {
        "openai_compatible",
        "openai-compatible",
        "dashscope",
        "openai",
    }
)

MAX_TRANSIENT_RETRIES = 2
RETRY_DELAY_SEC = 0.8


class SummaryConfigError(Exception):
    """Thiếu địa chỉ, khóa, hoặc tên model mây. Không kèm giá trị bí mật."""


def llm_provider(env=None):
    source = env if env is not None else os.environ
    return str(source.get("LLM_PROVIDER") or "ollama").strip().lower()


def is_remote_provider(env=None):
    return llm_provider(env) in REMOTE_PROVIDERS


def build_summary_call(prompt, env=None):
    source = env if env is not None else os.environ
    if is_remote_provider(source):
        base = str(source.get("OPENAI_BASE_URL") or source.get("DASHSCOPE_BASE_URL") or "").strip().rstrip("/")
        key = str(source.get("DASHSCOPE_API_KEY") or source.get("OPENAI_API_KEY") or "").strip()
        model = str(source.get("LLM_CHAT_MODEL") or "").strip()
        if not base or not key or not model:
            raise SummaryConfigError("remote_llm_config_missing")
        return {
            "url": f"{base}/chat/completions",
            "headers": {
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            "json": {
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.1,
                "max_tokens": 1024,
            },
            "timeout": 180,
        }

    base = str(source.get("OLLAMA_BASE_URL") or "http://ollama:11434").strip().rstrip("/")
    model = str(source.get("OLLAMA_MODEL") or "qwen2.5:3b-instruct").strip() or "qwen2.5:3b-instruct"
    return {
        "url": f"{base}/api/generate",
        "headers": {"Content-Type": "application/json"},
        "json": {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "format": "json",
        },
        "timeout": 180,
    }


def response_text(payload, env=None):
    body = payload or {}
    if is_remote_provider(env):
        choices = body.get("choices") or []
        if not choices:
            return ""
        message = choices[0].get("message") or {}
        return str(message.get("content") or "").strip()
    return str(body.get("response") or "").strip()


def extract_json_object(text: str):
    """Lấy object JSON đầu tiên; bỏ khối markdown ```json nếu model bọc thêm."""
    raw = str(text or "").strip()
    if not raw:
        return None
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", raw, flags=re.IGNORECASE)
    if fence:
        raw = fence.group(1).strip()
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        pass
    start = raw.find("{")
    end = raw.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        parsed = json.loads(raw[start : end + 1])
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        return None


def _is_retryable_status(status):
    return status in (429, 502, 503, 504)


def request_summary_text(prompt, env=None, post=None, sleep_fn=None):
    remote = is_remote_provider(env)
    send_prompt = prompt
    tokens = {}
    if remote:
        send_prompt, tokens = mask_prompt_privacy(prompt)

    call = build_summary_call(send_prompt, env)
    http_post = post or requests.post
    wait = sleep_fn or time.sleep
    last_exc = None

    for attempt in range(MAX_TRANSIENT_RETRIES + 1):
        try:
            res = http_post(
                call["url"],
                headers=call["headers"],
                json=call["json"],
                timeout=call["timeout"],
            )
            status = getattr(res, "status_code", None)
            if status is not None and status >= 400:
                if remote and _is_retryable_status(status) and attempt < MAX_TRANSIENT_RETRIES:
                    wait(RETRY_DELAY_SEC)
                    continue
                res.raise_for_status()
            text = response_text(res.json(), env)
            if remote and tokens:
                return unmask_prompt_privacy(text, tokens)
            return text
        except requests.Timeout as exc:
            last_exc = exc
            if remote and attempt < MAX_TRANSIENT_RETRIES:
                wait(RETRY_DELAY_SEC)
                continue
            raise
        except requests.HTTPError as exc:
            last_exc = exc
            status = getattr(getattr(exc, "response", None), "status_code", None)
            if remote and _is_retryable_status(status) and attempt < MAX_TRANSIENT_RETRIES:
                wait(RETRY_DELAY_SEC)
                continue
            raise

    if last_exc:
        raise last_exc
    raise RuntimeError("summary_request_failed")
