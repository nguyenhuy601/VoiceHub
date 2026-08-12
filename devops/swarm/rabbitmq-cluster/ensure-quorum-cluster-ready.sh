#!/usr/bin/env bash
# Kiểm tra cluster RabbitMQ đủ điều kiện declare quorum queue.
# Quorum cần majority disk nodes đang chạy (2/3 với cluster 3 node, hoặc 1/1 với cluster 1 node).
#
# Usage: bash devops/swarm/rabbitmq-cluster/ensure-quorum-cluster-ready.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

CONTAINER="${RABBITMQ_ADMIN_CONTAINER:-}"
if [[ -z "$CONTAINER" ]]; then
  CONTAINER="$(docker ps --format '{{.Names}}' | grep -E 'rabbitmq-1' | head -1 || true)"
fi

if [[ -z "$CONTAINER" ]]; then
  echo "[FAIL] RabbitMQ container not found" >&2
  exit 1
fi

echo "Checking cluster via $CONTAINER ..."
STATUS="$(docker exec "$CONTAINER" rabbitmqctl cluster_status 2>&1 || true)"
echo "$STATUS" | sed -n '/Disk Nodes/,/Versions/p' | head -20

RUNNING="$(docker exec "$CONTAINER" rabbitmqctl eval 'length(rabbit_mnesia:cluster_nodes(running)).' 2>/dev/null || echo 0)"
DISK="$(docker exec "$CONTAINER" rabbitmqctl eval 'length(rabbit_mnesia:cluster_nodes(all)).' 2>/dev/null || echo 0)"
MAJORITY=$(( (DISK / 2) + 1 ))

echo ""
echo "Running nodes: $RUNNING / Disk members: $DISK (majority cần >= $MAJORITY)"

if [[ "$RUNNING" -lt "$MAJORITY" ]]; then
  echo ""
  echo "[FAIL] Cluster chưa đủ quorum majority — declare queue kiểu quorum sẽ lỗi cluster_not_formed." >&2
  echo "  Production (khuyến nghị): RABBITMQ_CLUSTER_SIZE=3, cả 3 node healthy." >&2
  echo "  Dev single-node: redeploy cluster sạch 1 member (xem p1-quorum-migration.md)." >&2
  echo "  Tạm thời: docker service scale voicehub-rabbit_rabbitmq-2=1 voicehub-rabbit_rabbitmq-3=1" >&2
  exit 1
fi

echo "[OK] Cluster đủ điều kiện quorum"
