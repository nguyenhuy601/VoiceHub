"""Chọn Ollama hoặc Alibaba khi tóm tắt cuộc họp. Không import processor."""

import os
import sys
import unittest

import requests

WORKER_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if WORKER_ROOT not in sys.path:
    sys.path.insert(0, WORKER_ROOT)

from src.summary_llm import (
    SummaryConfigError,
    build_summary_call,
    extract_json_object,
    request_summary_text,
)


class _Response:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            err = requests.HTTPError(f"HTTP {self.status_code}")
            err.response = self
            raise err

    def json(self):
        return self._payload


class SummarizeProviderTest(unittest.TestCase):
    def test_cloud_uses_chat_completions_and_chat_model(self):
        seen = {}

        def post(url, headers, json, timeout):
            seen["url"] = url
            seen["headers"] = headers
            seen["json"] = json
            seen["timeout"] = timeout
            return _Response({"choices": [{"message": {"content": '{"summary":"ok"}'}}]})

        env = {
            "LLM_PROVIDER": "openai_compatible",
            "OPENAI_BASE_URL": "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
            "DASHSCOPE_API_KEY": "sk-test",
            "LLM_CHAT_MODEL": "qwen-plus-2025-07-28",
            "OLLAMA_MODEL": "qwen2.5:3b-instruct",
            "OLLAMA_BASE_URL": "http://ollama:11434",
        }
        text = request_summary_text("hello", env=env, post=post)
        self.assertEqual(text, '{"summary":"ok"}')
        self.assertTrue(seen["url"].endswith("/chat/completions"))
        self.assertNotIn("/api/generate", seen["url"])
        self.assertEqual(seen["json"]["model"], "qwen-plus-2025-07-28")
        self.assertEqual(seen["json"]["messages"][0]["role"], "user")
        self.assertEqual(seen["json"]["messages"][0]["content"], "hello")
        self.assertNotIn("prompt", seen["json"])

    def test_ollama_uses_generate(self):
        seen = {}

        def post(url, headers, json, timeout):
            seen["url"] = url
            seen["json"] = json
            seen["headers"] = headers
            return _Response({"response": '{"summary":"local"}'})

        env = {
            "LLM_PROVIDER": "ollama",
            "OLLAMA_BASE_URL": "http://ollama:11434",
            "OLLAMA_MODEL": "qwen2.5:3b-instruct",
            "LLM_CHAT_MODEL": "qwen-plus-2025-07-28",
        }
        text = request_summary_text("hello", env=env, post=post)
        self.assertEqual(text, '{"summary":"local"}')
        self.assertTrue(seen["url"].endswith("/api/generate"))
        self.assertNotIn("chat/completions", seen["url"])
        self.assertEqual(seen["json"]["model"], "qwen2.5:3b-instruct")
        self.assertEqual(seen["json"]["prompt"], "hello")
        self.assertNotIn("Authorization", seen["headers"])

    def test_cloud_missing_model_does_not_post(self):
        def post(url, headers, json, timeout):
            raise AssertionError("should not post")

        env = {
            "LLM_PROVIDER": "openai_compatible",
            "OPENAI_BASE_URL": "https://example.com/v1",
            "DASHSCOPE_API_KEY": "sk-test",
            "OLLAMA_MODEL": "qwen2.5:3b-instruct",
        }
        with self.assertRaises(SummaryConfigError):
            build_summary_call("hello", env)
        with self.assertRaises(SummaryConfigError):
            request_summary_text("hello", env=env, post=post)

    def test_cloud_masks_email_and_phone(self):
        seen = {}

        def post(url, headers, json, timeout):
            seen["content"] = json["messages"][0]["content"]
            return _Response(
                {"choices": [{"message": {"content": seen["content"] + " done"}}]}
            )

        env = {
            "LLM_PROVIDER": "openai_compatible",
            "OPENAI_BASE_URL": "https://example.com/v1",
            "DASHSCOPE_API_KEY": "sk-test",
            "LLM_CHAT_MODEL": "qwen-plus-2025-07-28",
        }
        text = request_summary_text(
            "Mail a@example.com phone 0912345678", env=env, post=post
        )
        self.assertNotIn("a@example.com", seen["content"])
        self.assertNotIn("0912345678", seen["content"])
        self.assertIn("__VH_PII_", seen["content"])
        self.assertEqual(text, "Mail a@example.com phone 0912345678 done")

    def test_extract_json_object_strips_markdown_fence(self):
        parsed = extract_json_object(
            '```json\n{"summary":"ok","keyPoints":["a"],"actionItems":[]}\n```'
        )
        self.assertEqual(parsed["summary"], "ok")
        self.assertEqual(parsed["keyPoints"], ["a"])

    def test_cloud_retries_on_429(self):
        attempts = {"n": 0}
        sleeps = []

        def post(url, headers, json, timeout):
            attempts["n"] += 1
            if attempts["n"] == 1:
                return _Response({}, status_code=429)
            return _Response({"choices": [{"message": {"content": '{"ok":true}'}}]})

        env = {
            "LLM_PROVIDER": "openai_compatible",
            "OPENAI_BASE_URL": "https://example.com/v1",
            "DASHSCOPE_API_KEY": "sk-test",
            "LLM_CHAT_MODEL": "qwen-plus-2025-07-28",
        }
        text = request_summary_text(
            "hello", env=env, post=post, sleep_fn=lambda _s: sleeps.append(_s)
        )
        self.assertEqual(text, '{"ok":true}')
        self.assertEqual(attempts["n"], 2)
        self.assertEqual(len(sleeps), 1)


if __name__ == "__main__":
    unittest.main()
