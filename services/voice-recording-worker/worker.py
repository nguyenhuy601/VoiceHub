import json
import logging
import os
import tempfile
import time

import pika
from dotenv import load_dotenv

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
    duration_sec = int(payload.get("durationSec") or 0)
    bitrate = int(payload.get("opusBitrateKbps") or 16)

    if not meeting_id or not temp_path_key:
        raise ValueError("Missing meetingId or tempStoragePath")

    webm_local = None
    opus_local = None
    try:
        webm_local = download_to_temp(temp_path_key)
        fd, opus_local = tempfile.mkstemp(suffix=".opus")
        os.close(fd)

        transcode_to_opus(webm_local, opus_local, bitrate)
        opus_key = build_opus_path(room_key, meeting_id)
        upload_file(opus_local, opus_key, "audio/opus")

        transcript = ""
        if not payload.get("skipTranscript"):
            transcript = transcribe_audio(opus_local)

        summary = summarize_transcript(transcript) if transcript else ""

        patch_meeting_recording(
            meeting_id,
            {
                "recordingStatus": "ready",
                "audioStoragePath": opus_key,
                "transcript": transcript,
                "summary": summary,
                "durationSec": duration_sec,
                "tempStoragePath": temp_path_key,
            },
        )
        delete_object(temp_path_key)
        logger.info("Recording ready meeting=%s path=%s", meeting_id, opus_key)
    except Exception as exc:
        logger.exception("Job failed meeting=%s: %s", meeting_id, exc)
        try:
            patch_meeting_recording(
                meeting_id,
                {
                    "recordingStatus": "failed",
                    "error": str(exc)[:500],
                    "tempStoragePath": temp_path_key,
                },
            )
        except Exception as patch_exc:
            logger.error("Failed to patch meeting status: %s", patch_exc)
        raise
    finally:
        for path in (webm_local, opus_local):
            if path and os.path.exists(path):
                try:
                    os.remove(path)
                except OSError:
                    pass


def on_message(ch, method, _properties, body):
    attempt = 0
    while attempt < MAX_RETRIES:
        try:
            payload = json.loads(body.decode("utf-8"))
            process_job(payload)
            ch.basic_ack(delivery_tag=method.delivery_tag)
            return
        except Exception:
            attempt += 1
            if attempt >= MAX_RETRIES:
                logger.error("Giving up after %s retries", MAX_RETRIES)
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
            ch.queue_declare(queue=QUEUE, durable=True)
            ch.basic_qos(prefetch_count=1)
            ch.basic_consume(queue=QUEUE, on_message_callback=on_message)
            logger.info("Consuming queue=%s", QUEUE)
            ch.start_consuming()
        except Exception as exc:
            logger.error("RabbitMQ connection error: %s — retry in 5s", exc)
            time.sleep(5)


if __name__ == "__main__":
    main()
