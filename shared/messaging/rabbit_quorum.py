"""P1-Rabbit-B — Quorum queue helpers for Python workers (pika / aio-pika)."""

from __future__ import annotations

import os


def is_quorum_queues_enabled() -> bool:
    raw = os.getenv("RABBITMQ_QUORUM_QUEUES", "true").lower()
    return raw not in ("false", "0", "no")


def quorum_queue_arguments() -> dict | None:
    if not is_quorum_queues_enabled():
        return None
    return {"x-queue-type": "quorum"}


def declare_queue(channel, name: str, *, durable: bool = True):
    args = quorum_queue_arguments()
    if args:
        return channel.queue_declare(queue=name, durable=durable, arguments=args)
    return channel.queue_declare(queue=name, durable=durable)
