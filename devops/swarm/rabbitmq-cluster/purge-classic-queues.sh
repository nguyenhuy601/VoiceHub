#!/usr/bin/env bash
# P1-Rabbit-B — Xóa classic queue trước khi declare quorum (staging only)
# bash devops/swarm/rabbitmq-cluster/purge-classic-queues.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

CONTAINER="${RABBITMQ_ADMIN_CONTAINER:-}"
if [[ -z "$CONTAINER" ]]; then
  CONTAINER="$(docker ps --format '{{.Names}}' | grep -E 'rabbitmq-1|enterprise-rabbitmq|rabbitmq' | head -1 || true)"
fi

if [[ -z "$CONTAINER" ]]; then
  echo "[FAIL] RabbitMQ container not found" >&2
  exit 1
fi

QUEUES=(
  voicehub.friend.dm
  voicehub.notification.dispatch
  voicehub.notification.dispatch.dlq
  task-ai.extract
  task-ai.sync
  task-ai.dlq
  voicehub.task.from_file
  voicehub.task.from_file.dlq
  voicehub.webhook.delivery
  voicehub.webhook.delivery.dlq
  voicehub.org.events.chat
  voicehub.org.events.chat.dlq
  voicehub.org.events.notification
  voicehub.org.events.notification.dlq
  voicehub.message.search.index
  voicehub.message.search.index.dlq
)

echo "Purging/deleting queues on $CONTAINER (staging)"
for q in "${QUEUES[@]}"; do
  if docker exec "$CONTAINER" rabbitmqctl delete_queue "$q" 2>/dev/null; then
    echo "[OK] deleted $q"
  else
    echo "[SKIP] $q (missing or in use)"
  fi
done

echo "purge-classic-queues: done"
