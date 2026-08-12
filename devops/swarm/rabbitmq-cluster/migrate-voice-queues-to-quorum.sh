#!/usr/bin/env bash
# Cách 2 — Migrate voice RabbitMQ queues từ classic sang quorum.
#
# Thứ tự:
#   0. Kiểm tra cluster đủ majority cho quorum (bắt buộc)
#   1. Dừng publisher (voice-service) + consumer (voice workers)
#   2. Xóa queue classic cũ
#   3. Khởi động lại workers (declare quorum) rồi voice-service
#
# Yêu cầu: RABBITMQ_QUORUM_QUEUES=true trong .env (mặc định code = true)
#
# Usage:
#   bash devops/swarm/rabbitmq-cluster/migrate-voice-queues-to-quorum.sh
#   bash devops/swarm/rabbitmq-cluster/migrate-voice-queues-to-quorum.sh --purge-only
#   bash devops/swarm/rabbitmq-cluster/migrate-voice-queues-to-quorum.sh --skip-restart
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

STACK="${STACK_NAME:-voicehub}"
COMPOSE_EXTRA=(docker compose -f docker-compose.swarm-extra.yml --env-file .env)
PURGE_ONLY=0
SKIP_RESTART=0

for arg in "$@"; do
  case "$arg" in
    --purge-only) PURGE_ONLY=1 ;;
    --skip-restart) SKIP_RESTART=1 ;;
  esac
done

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

if [[ "${SKIP_QUORUM_PRECHECK:-}" != "1" ]]; then
  bash "$ROOT/devops/swarm/rabbitmq-cluster/ensure-quorum-cluster-ready.sh"
fi

VOICE_QUEUES=(
  "${RABBITMQ_VOICE_RECORDING_QUEUE:-voice.recording.process}"
  "${RABBITMQ_VOICE_RECORDING_DLQ:-voice.recording.dlq}"
  "${RABBITMQ_VOICE_STT_QUEUE:-voice.stt.chunk}"
  "${RABBITMQ_VOICE_STT_DLQ:-voice.stt.dlq}"
  "${RABBITMQ_VOICE_SUMMARY_QUEUE:-voice.summary.process}"
  "${RABBITMQ_VOICE_SUMMARY_DLQ:-voice.summary.dlq}"
)

echo "=== [1/5] Dừng publisher + consumer voice ==="
docker service scale "${STACK}_voice-service=0" 2>/dev/null || echo "[WARN] Không scale được ${STACK}_voice-service (Swarm?)"
"${COMPOSE_EXTRA[@]}" stop voice-recording-worker voice-stt-worker 2>/dev/null || true
sleep 3

echo "=== [2/5] Kiểm tra queue depth (nên ≈ 0) ==="
CONTAINER="${RABBITMQ_ADMIN_CONTAINER:-}"
if [[ -z "$CONTAINER" ]]; then
  CONTAINER="$(docker ps --format '{{.Names}}' | grep -E 'rabbitmq-1|enterprise-rabbitmq' | head -1 || true)"
fi
if [[ -z "$CONTAINER" ]]; then
  echo "[FAIL] RabbitMQ container not found" >&2
  exit 1
fi

for q in "${VOICE_QUEUES[@]}"; do
  depth="$(docker exec "$CONTAINER" rabbitmqctl list_queues name messages --formatter json 2>/dev/null \
    | python -c "import json,sys; data=json.load(sys.stdin); print(next((x['messages'] for x in data if x['name']=='$q'), 'missing'))" 2>/dev/null \
    || echo "?")"
  echo "  $q messages=$depth"
  if [[ "$depth" =~ ^[0-9]+$ ]] && [[ "$depth" -gt 0 ]]; then
    echo "[WARN] Queue $q còn $depth message — purge sẽ mất dữ liệu chưa xử lý" >&2
  fi
done

echo "=== [3/5] Xóa classic voice queues ==="
for q in "${VOICE_QUEUES[@]}"; do
  if docker exec "$CONTAINER" rabbitmqctl delete_queue "$q" 2>/dev/null; then
    echo "[OK] deleted $q"
  else
    echo "[SKIP] $q (missing or in use)"
  fi
done

if [[ "$PURGE_ONLY" == "1" ]]; then
  echo "purge-only: done (chưa khởi động lại service)"
  exit 0
fi

if [[ "$SKIP_RESTART" == "1" ]]; then
  echo "skip-restart: queues đã xóa — deploy/restart thủ công"
  exit 0
fi

echo "=== [4/5] Rebuild + khởi động workers (declare quorum) ==="
"${COMPOSE_EXTRA[@]}" up -d --build voice-recording-worker voice-stt-worker

echo "=== [5/5] Khởi động voice-service (publisher) ==="
docker service scale "${STACK}_voice-service=1" 2>/dev/null || echo "[WARN] Scale voice-service thủ công nếu không dùng Swarm"

sleep 5
echo ""
echo "=== Kiểm tra queue type ==="
docker exec "$CONTAINER" rabbitmqctl list_queues name type messages consumers | grep -E 'voice\.(recording|stt|summary)' || true

echo ""
echo "[OK] migrate-voice-queues-to-quorum: done"
echo "  Rebuild voice-service image nếu chưa deploy code quorum mới:"
echo "    docker service update --force ${STACK}_voice-service"
