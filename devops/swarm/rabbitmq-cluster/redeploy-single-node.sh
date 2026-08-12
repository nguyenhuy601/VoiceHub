#!/usr/bin/env bash
# Dev single-node — redeploy RabbitMQ cluster sạch (chỉ rabbitmq-1, metadata 1 member).
# Xóa volume cũ để tránh cluster_not_formed khi quorum (metadata 3 node / 1 running).
#
# Usage:
#   bash devops/swarm/rabbitmq-cluster/redeploy-single-node.sh
#   bash devops/swarm/rabbitmq-cluster/redeploy-single-node.sh --skip-migrate
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

STACK="${RABBITMQ_CLUSTER_STACK_NAME:-voicehub-rabbit}"
APP_STACK="${STACK_NAME:-voicehub}"
SKIP_MIGRATE=0

for arg in "$@"; do
  case "$arg" in
    --skip-migrate) SKIP_MIGRATE=1 ;;
  esac
done

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

export RABBITMQ_CLUSTER_SIZE=1

echo "=== [1/6] Dừng voice publisher/consumer ==="
docker service scale "${APP_STACK}_voice-service=0" 2>/dev/null || true
docker compose -f docker-compose.swarm-extra.yml --env-file .env stop voice-recording-worker voice-stt-worker 2>/dev/null || true
sleep 3

echo "=== [2/6] Gỡ stack Rabbit (${STACK}) ==="
docker stack rm "$STACK" 2>/dev/null || true

echo "Waiting for stack removal..."
for _ in $(seq 1 30); do
  if ! docker stack ps "$STACK" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

echo "=== [3/6] Xóa volume Rabbit (metadata cluster cũ) ==="
for vol in "${STACK}_rabbitmq_1_data" "${STACK}_rabbitmq_2_data" "${STACK}_rabbitmq_3_data"; do
  if docker volume rm "$vol" 2>/dev/null; then
    echo "[OK] removed $vol"
  else
    echo "[SKIP] $vol"
  fi
done

echo "=== [4/6] Deploy cluster single-node (rabbitmq-1 only) ==="
bash "$ROOT/devops/swarm/rabbitmq-cluster/deploy-cluster-stack.sh"

echo "Waiting for rabbitmq-1 healthy..."
RABBIT=""
for _ in $(seq 1 40); do
  RABBIT="$(docker ps --format '{{.Names}}' | grep -E "${STACK}.*rabbitmq-1" | head -1 || true)"
  if [[ -n "$RABBIT" ]] && docker exec "$RABBIT" rabbitmq-diagnostics -q ping >/dev/null 2>&1; then
    break
  fi
  sleep 3
done

if [[ -z "$RABBIT" ]]; then
  echo "[FAIL] rabbitmq-1 container not ready" >&2
  exit 1
fi

echo "=== [5/6] Verify cluster (1 disk member) ==="
DISK="$(docker exec "$RABBIT" rabbitmqctl eval 'length(rabbit_mnesia:cluster_nodes(all)).' 2>/dev/null || echo 0)"
RUNNING="$(docker exec "$RABBIT" rabbitmqctl eval 'length(rabbit_mnesia:cluster_nodes(running)).' 2>/dev/null || echo 0)"
echo "Disk members=$DISK Running=$RUNNING"
if [[ "$DISK" != "1" ]] || [[ "$RUNNING" != "1" ]]; then
  docker exec "$RABBIT" rabbitmqctl cluster_status 2>&1 | head -25
  echo "[FAIL] Cluster chưa phải single-node sạch" >&2
  exit 1
fi

if [[ "$SKIP_MIGRATE" != "1" ]]; then
  # Bỏ qua pre-check trong migrate (vừa verify ở bước 5)
  SKIP_QUORUM_PRECHECK=1 bash "$ROOT/devops/swarm/rabbitmq-cluster/migrate-voice-queues-to-quorum.sh"
else
  echo "[OK] redeploy-single-node done (bỏ qua migrate voice queues)"
  exit 0
fi

echo ""
echo "[OK] RabbitMQ single-node + voice quorum queues ready"
echo "  Các queue app khác (notification, task, …) sẽ được tạo lại khi service reconnect."
