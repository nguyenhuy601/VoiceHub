import os
import logging

logger = logging.getLogger(__name__)

_whisper_model = None


def _self_hosted_transcribe(audio_path: str) -> str:
    global _whisper_model
    from faster_whisper import WhisperModel

    model_name = os.environ.get("WHISPER_MODEL", "base")
    if _whisper_model is None:
        _whisper_model = WhisperModel(model_name, device="cpu", compute_type="int8")

    segments, _info = _whisper_model.transcribe(audio_path, beam_size=1, language=None)
    lines = [seg.text.strip() for seg in segments if seg.text and seg.text.strip()]
    return "\n".join(lines).strip()


def _deepgram_transcribe(audio_path: str) -> str:
    import requests

    api_key = os.environ.get("DEEPGRAM_API_KEY", "")
    if not api_key:
        raise RuntimeError("DEEPGRAM_API_KEY not set")

    with open(audio_path, "rb") as f:
        audio_data = f.read()

    res = requests.post(
        "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true",
        headers={
            "Authorization": f"Token {api_key}",
            "Content-Type": "audio/webm",
        },
        data=audio_data,
        timeout=120,
    )
    res.raise_for_status()
    body = res.json()
    alt = (
        body.get("results", {})
        .get("channels", [{}])[0]
        .get("alternatives", [{}])[0]
        .get("transcript", "")
    )
    return str(alt).strip()


def _assemblyai_transcribe(audio_path: str) -> str:
    import requests
    import time

    api_key = os.environ.get("ASSEMBLYAI_API_KEY", "")
    if not api_key:
        raise RuntimeError("ASSEMBLYAI_API_KEY not set")

    with open(audio_path, "rb") as f:
        upload_res = requests.post(
            "https://api.assemblyai.com/v2/upload",
            headers={"authorization": api_key},
            data=f,
            timeout=120,
        )
    upload_res.raise_for_status()
    upload_url = upload_res.json().get("upload_url")

    job_res = requests.post(
        "https://api.assemblyai.com/v2/transcript",
        headers={"authorization": api_key},
        json={"audio_url": upload_url},
        timeout=30,
    )
    job_res.raise_for_status()
    job_id = job_res.json().get("id")

    for _ in range(60):
        poll = requests.get(
            f"https://api.assemblyai.com/v2/transcript/{job_id}",
            headers={"authorization": api_key},
            timeout=30,
        )
        poll.raise_for_status()
        status = poll.json().get("status")
        if status == "completed":
            return str(poll.json().get("text") or "").strip()
        if status == "error":
            raise RuntimeError(poll.json().get("error", "AssemblyAI failed"))
        time.sleep(2)
    raise RuntimeError("AssemblyAI timeout")


def transcribe_chunk(audio_path: str) -> str:
    provider = os.environ.get("VOICE_STT_PROVIDER", "self_hosted").lower()
    if provider == "deepgram":
        try:
            return _deepgram_transcribe(audio_path)
        except Exception as exc:
            logger.warning("Deepgram failed, fallback whisper: %s", exc)
            return _self_hosted_transcribe(audio_path)
    if provider == "assemblyai":
        try:
            return _assemblyai_transcribe(audio_path)
        except Exception as exc:
            logger.warning("AssemblyAI failed, fallback whisper: %s", exc)
            return _self_hosted_transcribe(audio_path)
    return _self_hosted_transcribe(audio_path)
