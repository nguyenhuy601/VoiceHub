import json
import os
import re
import subprocess
import logging

import requests

logger = logging.getLogger(__name__)


def transcode_to_opus(input_path: str, output_path: str, bitrate_kbps: int = 16) -> None:
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        input_path,
        "-vn",
        "-c:a",
        "libopus",
        "-b:a",
        f"{bitrate_kbps}k",
        output_path,
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {proc.stderr[-500:]}")


_whisper_model = None


def transcribe_audio(audio_path: str) -> str:
    if os.environ.get("VOICE_RECORDING_SKIP_TRANSCRIPT", "false").lower() == "true":
        return ""

    global _whisper_model
    from faster_whisper import WhisperModel

    model_name = os.environ.get("WHISPER_MODEL", "base")
    if _whisper_model is None:
        _whisper_model = WhisperModel(model_name, device="cpu", compute_type="int8")

    segments, _info = _whisper_model.transcribe(audio_path, beam_size=1, language=None)
    lines = [seg.text.strip() for seg in segments if seg.text and seg.text.strip()]
    return "\n".join(lines).strip()


def summarize_transcript(transcript: str) -> str:
    text = (transcript or "").strip()
    if not text:
        return ""

    base = os.environ.get("OLLAMA_BASE_URL", "http://ollama:11434").rstrip("/")
    model = os.environ.get("OLLAMA_MODEL", "qwen2.5:3b-instruct")
    prompt = f"""Bạn là trợ lý tóm tắt cuộc họp thoại. Dựa trên transcript sau, viết tóm tắt ngắn 3-6 câu bằng tiếng Việt (hoặc ngôn ngữ chính của transcript). Không dùng markdown.

Transcript:
{text[:12000]}
"""

    try:
        res = requests.post(
            f"{base}/api/generate",
            json={"model": model, "prompt": prompt, "stream": False},
            timeout=180,
        )
        res.raise_for_status()
        body = res.json()
        raw = str(body.get("response") or "").strip()
        return re.sub(r"\s+", " ", raw).strip()
    except Exception as exc:
        logger.warning("Ollama summary failed: %s", exc)
        return text[:400] + ("..." if len(text) > 400 else "")


def patch_meeting_recording(meeting_id: str, payload: dict) -> None:
    base = os.environ.get("VOICE_SERVICE_URL", "http://voice-service:3005").rstrip("/")
    token = os.environ.get("GATEWAY_INTERNAL_TOKEN", "")
    url = f"{base}/api/meetings/internal/{meeting_id}/recording"
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
