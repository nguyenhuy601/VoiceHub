import json
import os
import re
import logging

import requests
from src.storage import download_to_temp

logger = logging.getLogger(__name__)


def patch_transcript_chunk(meeting_id: str, payload: dict) -> None:
    base = os.environ.get("VOICE_SERVICE_URL", "http://voice-service:3005").rstrip("/")
    token = os.environ.get("GATEWAY_INTERNAL_TOKEN", "")
    url = f"{base}/api/meetings/internal/{meeting_id}/transcript-chunk"
    res = requests.patch(
        url,
        headers={
            "x-gateway-internal-token": token,
            "Content-Type": "application/json",
        },
        data=json.dumps(payload),
        timeout=30,
    )
    res.raise_for_status()


def patch_summary(meeting_id: str, payload: dict) -> None:
    base = os.environ.get("VOICE_SERVICE_URL", "http://voice-service:3005").rstrip("/")
    token = os.environ.get("GATEWAY_INTERNAL_TOKEN", "")
    url = f"{base}/api/meetings/internal/{meeting_id}/summary"
    res = requests.patch(
        url,
        headers={
            "x-gateway-internal-token": token,
            "Content-Type": "application/json",
        },
        data=json.dumps(payload),
        timeout=60,
    )
    res.raise_for_status()


def process_stt_chunk(payload: dict) -> None:
    meeting_id = str(payload.get("meetingId") or "")
    storage_path = str(payload.get("storagePath") or "")
    if not meeting_id or not storage_path:
        raise ValueError("Missing meetingId or storagePath")

    local_path = download_to_temp(storage_path)
    try:
        text = transcribe_chunk(local_path)
        if not text:
            return
        patch_transcript_chunk(
            meeting_id,
            {
                "seq": int(payload.get("seq") or 0),
                "text": text,
                "speakerId": str(payload.get("speakerId") or ""),
                "displayName": str(payload.get("displayName") or ""),
            },
        )
        logger.info("STT chunk meeting=%s seq=%s len=%s", meeting_id, payload.get("seq"), len(text))
    finally:
        try:
            os.remove(local_path)
        except OSError:
            pass


def summarize_structured(transcript: str) -> dict:
    text = (transcript or "").strip()
    if not text:
        return {"summary": "", "keyPoints": [], "actionItems": []}

    base = os.environ.get("OLLAMA_BASE_URL", "http://ollama:11434").rstrip("/")
    model = os.environ.get("OLLAMA_MODEL", "qwen2.5:3b-instruct")
    prompt = f"""Bạn là trợ lý tóm tắt cuộc họp thoại. Dựa trên transcript sau, trả về JSON hợp lệ (không markdown) với các key:
- summary: tóm tắt 3-6 câu
- keyPoints: mảng các ý chính (string)
- actionItems: mảng việc cần làm nếu có (string), có thể rỗng

Transcript:
{text[:12000]}
"""

    try:
        res = requests.post(
            f"{base}/api/generate",
            json={"model": model, "prompt": prompt, "stream": False, "format": "json"},
            timeout=180,
        )
        res.raise_for_status()
        raw = str(res.json().get("response") or "").strip()
        parsed = json.loads(raw)
        return {
            "summary": str(parsed.get("summary") or "").strip(),
            "keyPoints": [str(x) for x in (parsed.get("keyPoints") or []) if str(x).strip()],
            "actionItems": [str(x) for x in (parsed.get("actionItems") or []) if str(x).strip()],
        }
    except Exception as exc:
        logger.warning("Structured summary failed: %s", exc)
        fallback = text[:400] + ("..." if len(text) > 400 else "")
        return {"summary": fallback, "keyPoints": [], "actionItems": []}


def process_summary_job(payload: dict) -> None:
    meeting_id = str(payload.get("meetingId") or "")
    transcript = str(payload.get("transcript") or "").strip()
    if not meeting_id:
        raise ValueError("Missing meetingId")
    if not transcript:
        patch_summary(meeting_id, {"summaryStatus": "none", "summary": ""})
        return

    structured = summarize_structured(transcript)
    patch_summary(
        meeting_id,
        {
            "summaryStatus": "ready",
            "summary": structured.get("summary") or "",
            "summaryStructured": structured,
            "keyPoints": structured.get("keyPoints") or [],
            "actionItems": structured.get("actionItems") or [],
        },
    )
    logger.info("Summary ready meeting=%s", meeting_id)
