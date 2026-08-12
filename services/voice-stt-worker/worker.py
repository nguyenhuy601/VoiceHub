import json
import os
import logging

import pika
from dotenv import load_dotenv

from rabbit_quorum import declare_queue
from src.processor import patch_transcript_chunk, process_summary_job, process_stt_chunk
from src.storage import delete_object

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("voice-stt-worker")

STT_QUEUE = os.environ.get("RABBITMQ_VOICE_STT_QUEUE", "voice.stt.chunk")
SUMMARY_QUEUE = os.environ.get("RABBITMQ_VOICE_SUMMARY_QUEUE", "voice.summary.process")
STT_DLQ = os.environ.get("RABBITMQ_VOICE_STT_DLQ", "voice.stt.dlq")
SUMMARY_DLQ = os.environ.get("RABBITMQ_VOICE_SUMMARY_DLQ", "voice.summary.dlq")
MAX_RETRIES = 3


def _retry_process(fn, payload, queue_name):
    attempt = 0
    last_exc = None
    while attempt < MAX_RETRIES:
        try:
            fn(payload)
            return
        except Exception as exc:
            last_exc = exc
            attempt += 1
            if attempt >= MAX_RETRIES:
                raise last_exc


def on_stt_message(ch, method, _properties, body):
    try:
        payload = json.loads(body.decode("utf-8"))
        storage_path = str(payload.get("storagePath") or "")
        try:
            _retry_process(process_stt_chunk, payload, STT_QUEUE)
            ch.basic_ack(delivery_tag=method.delivery_tag)
        except Exception:
            logger.exception("STT chunk failed meeting=%s", payload.get("meetingId"))
            ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
        finally:
            if storage_path:
                delete_object(storage_path)
    except Exception:
        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)


def on_summary_message(ch, method, _properties, body):
    try:
        payload = json.loads(body.decode("utf-8"))
        try:
            _retry_process(process_summary_job, payload, SUMMARY_QUEUE)
            ch.basic_ack(delivery_tag=method.delivery_tag)
        except Exception:
            logger.exception("Summary job failed meeting=%s", payload.get("meetingId"))
            ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
    except Exception:
        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)


def main():
    url = os.environ.get("RABBITMQ_URL")
    if not url:
        raise RuntimeError("RABBITMQ_URL is not set")

    while True:
        try:
            conn = pika.BlockingConnection(pika.URLParameters(url))
            ch = conn.channel()
            declare_queue(ch, STT_QUEUE)
            declare_queue(ch, SUMMARY_QUEUE)
            declare_queue(ch, STT_DLQ)
            declare_queue(ch, SUMMARY_DLQ)
            ch.basic_qos(prefetch_count=1)
            ch.basic_consume(queue=STT_QUEUE, on_message_callback=on_stt_message)
            ch.basic_consume(queue=SUMMARY_QUEUE, on_message_callback=on_summary_message)
            logger.info("Consuming stt=%s summary=%s", STT_QUEUE, SUMMARY_QUEUE)
            ch.start_consuming()
        except Exception as exc:
            logger.error("RabbitMQ connection error: %s — retry in 5s", exc)
            import time

            time.sleep(5)


if __name__ == "__main__":
    main()
