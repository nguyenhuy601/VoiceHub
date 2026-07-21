import json
import logging
import os
import tempfile
import time

import pika
from dotenv import load_dotenv

from rabbit_quorum import declare_queue
from src.processor import patch_meeting_recording, summarize_transcript, transcribe_audio, transcode_to_opus
from src.storage import build_opus_path, delete_object, download_to_temp, upload_file

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("voice-recording-worker")

QUEUE = os.environ.get("RABBITMQ_VOICE_RECORDING_QUEUE", "voice.recording.process")
MAX_RETRIES = 3


def process_job(payload: dict) -> None:
    meeting_id = str(payload.get("meetingId") or "")
    room_key = str(payload.get("roomKey") or meeting_id)
    temp_path_key = str(payload.get("tempStoragePath") or "")
    audio_storage_path = str(payload.get("audioStoragePath") or "")
    duration_sec = int(payload.get("durationSec") or 0)
    bitrate = int(payload.get("opusBitrateKbps") or 16)
    skip_transcode = bool(payload.get("skipTranscode"))
    skip_transcript = bool(payload.get("skipTranscript"))
    segment_id = str(payload.get("segmentId") or "")
    job_type = str(payload.get("jobType") or "legacy_full")

    if not meeting_id:
        raise ValueError("Missing meetingId")

    webm_local = None
    opus_local = None
    opus_key = audio_storage_path
    try:
        if skip_transcode and audio_storage_path:
            opus_local = download_to_temp(audio_storage_path)
            opus_key = audio_storage_path
        else:
            if not temp_path_key:
                raise ValueError("Missing tempStoragePath")
            webm_local = download_to_temp(temp_path_key)
            fd, opus_local = tempfile.mkstemp(suffix=".opus")
            os.close(fd)
            transcode_to_opus(webm_local, opus_local, bitrate)
            if segment_id and audio_storage_path:
                opus_key = audio_storage_path
            else:
                opus_key = build_opus_path(room_key, meeting_id)
            upload_file(opus_local, opus_key, "audio/opus")

        patch_payload = {
            "recordingStatus": "ready",
            "audioStoragePath": opus_key,
            "durationSec": duration_sec,
        }
        if segment_id:
            patch_payload["segmentId"] = segment_id

        if not skip_transcript and job_type == "legacy_full":
            transcript = transcribe_audio(opus_local)
            summary = summarize_transcript(transcript) if transcript else ""
            patch_payload["transcript"] = transcript
            patch_payload["summary"] = summary
            patch_payload["transcriptSource"] = "post_audio"

        if temp_path_key:
            patch_payload["tempStoragePath"] = temp_path_key

        patch_meeting_recording(meeting_id, patch_payload)
        if temp_path_key:
            delete_object(temp_path_key)
        logger.info("Recording ready meeting=%s path=%s job=%s", meeting_id, opus_key, job_type)
    except Exception as exc:
        logger.exception("Job failed meeting=%s: %s", meeting_id, exc)
        # Không patch failed / không gửi tempStoragePath ở đây —
        # tránh xóa temp trước khi retry; on_message patch sau hết retry.
        raise
    finally:
        for path in (webm_local, opus_local):
            if path and os.path.exists(path):
                try:
                    os.remove(path)
                except OSError:
                    pass


def patch_job_failed(payload: dict, error: BaseException) -> None:
    meeting_id = str(payload.get("meetingId") or "")
    if not meeting_id:
        return
    fail_payload = {
        "recordingStatus": "failed",
        "error": str(error)[:500],
    }
    segment_id = str(payload.get("segmentId") or "")
    if segment_id:
        fail_payload["segmentId"] = segment_id
    # Không gửi tempStoragePath — voice-service chỉ xóa temp khi ready.
    try:
        patch_meeting_recording(meeting_id, fail_payload)
    except Exception as patch_exc:
        logger.error("Failed to patch meeting status: %s", patch_exc)


def on_message(ch, method, _properties, body):
    payload = {}
    try:
        payload = json.loads(body.decode("utf-8"))
    except Exception as exc:
        logger.error("Invalid job payload: %s", exc)
        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
        return

    attempt = 0
    last_error = None
    while attempt < MAX_RETRIES:
        try:
            process_job(payload)
            ch.basic_ack(delivery_tag=method.delivery_tag)
            return
        except Exception as exc:
            last_error = exc
            attempt += 1
            if attempt >= MAX_RETRIES:
                logger.error("Giving up after %s retries", MAX_RETRIES)
                patch_job_failed(payload, last_error)
                ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
                return
            time.sleep(2 ** attempt)


def main():
    url = os.environ.get("RABBITMQ_URL")
    if not url:
        raise RuntimeError("RABBITMQ_URL is not set")

    while True:
        try:
            conn = pika.BlockingConnection(pika.URLParameters(url))
            ch = conn.channel()
            declare_queue(ch, QUEUE)
            ch.basic_qos(prefetch_count=1)
            ch.basic_consume(queue=QUEUE, on_message_callback=on_message)
            logger.info("Consuming queue=%s", QUEUE)
            ch.start_consuming()
        except Exception as exc:
            logger.error("RabbitMQ connection error: %s — retry in 5s", exc)
            time.sleep(5)


if __name__ == "__main__":
    main()
