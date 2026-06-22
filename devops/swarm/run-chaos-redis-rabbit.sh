#!/usr/bin/env bash
# S3 — Chaos: restart Redis + RabbitMQ, verify queue drain (load-chaos-validation.md)
# Chạy: bash devops/swarm/run-chaos-redis-rabbit.sh
# Bỏ qua restart thật: CHAOS_DRY_RUN=1 bash devops/swarm/run-chaos-redis-rabbit.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

STACK_NAME="${STACK_NAME:-voicehub}"
FAIL=0
WARN=0
DRY_RUN="${CHAOS_DRY_RUN:-0}"

RABBIT_QUEUES=(
  voicehub.friend.dm
  task-ai.extract
  task-ai.sync
  voicehub.task.from_file
  voicehub.notification.dispatch
  voicehub.webhook.delivery
)

resolve_container() {
  local pattern="$1"
  docker ps --format '{{.Names}}' | grep -E "$pattern" | head -1 || true
}

rabbit_container="$(resolve_container 'rabbitmq|enterprise-rabbitmq')"
redis_container="$(resolve_container 'redis|enterprise-redis')"

if [[ -z "$rabbit_container" ]]; then
  echo "[FAIL] RabbitMQ container not found"
  exit 1
fi
if [[ -z "$redis_container" ]]; then
  echo "[FAIL] Redis container not found"
  exit 1
fi

echo "Redis container: $redis_container"
echo "RabbitMQ container: $rabbit_container"

queue_depths() {
  docker exec "$rabbit_container" rabbitmqctl list_queues name messages 2>/dev/null \
    | awk 'NR>1 && $2 ~ /^[0-9]+$/ {print $1, $2}'
}

echo ""
echo "=== Queue depth (before) ==="
before="$(queue_depths || true)"
echo "${before:-<empty or rabbitmqctl unavailable>}"

wait_redis() {
  local i
  for i in $(seq 1 30); do
    if docker exec "$redis_container" redis-cli ping 2>/dev/null | grep -q PONG; then
      return 0
    fi
    sleep 1
  done
  return 1
}

wait_rabbit() {
  local i
  for i in $(seq 1 60); do
    if docker exec "$rabbit_container" rabbitmqctl status >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

if [[ "$DRY_RUN" == "1" ]]; then
  echo ""
  echo "[SKIP] CHAOS_DRY_RUN=1 — không restart container"
  echo "Chaos redis/rabbit: DRY RUN OK"
  exit 0
fi

echo ""
echo "=== Restart Redis ==="
docker restart "$redis_container"
if wait_redis; then
  echo "[OK] Redis recovered (PONG)"
else
  echo "[FAIL] Redis did not recover in 30s"
  FAIL=1
fi

echo ""
echo "=== Restart RabbitMQ ==="
docker restart "$rabbit_container"
if wait_rabbit; then
  echo "[OK] RabbitMQ recovered"
else
  echo "[FAIL] RabbitMQ did not recover in 120s"
  FAIL=1
fi

echo ""
echo "=== Waiting for consumers to drain (max 120s) ==="
drained=0
for _ in $(seq 1 24); do
  after="$(queue_depths || true)"
  high=0
  while read -r q depth; do
    [[ -z "$q" ]] && continue
    if [[ "${depth:-0}" -gt 50 ]]; then
      high=1
      break
    fi
  done <<< "$after"
  if [[ "$high" -eq 0 ]]; then
    drained=1
    break
  fi
  sleep 5
done

echo "=== Queue depth (after) ==="
after="$(queue_depths || true)"
echo "${after:-<empty>}"

for q in "${RABBIT_QUEUES[@]}"; do
  depth="$(echo "$after" | awk -v name="$q" '$1==name {print $2}')"
  if [[ -n "$depth" ]] && [[ "$depth" -gt 100 ]]; then
    echo "[WARN] Queue $q depth=$depth (>100)"
    FAIL=1
  fi
done

if [[ "$drained" -eq 1 ]]; then
  echo "[OK] Queues drained to nominal depth"
else
  echo "[WARN] Some queues still elevated — check worker logs"
fi

# Socket health after infra bounce
socket_c="$(resolve_container 'socket-service|enterprise-socket-service')"
if [[ -n "$socket_c" ]]; then
  if docker exec "$socket_c" node -e "const h=require('http');h.get('http://127.0.0.1:3017/health',r=>{r.on('data',()=>{});r.on('end',()=>process.exit(r.statusCode===200?0:1))}).on('error',()=>process.exit(1));" 2>/dev/null; then
    echo "[OK] socket-service healthy after chaos"
  else
    echo "[WARN] socket-service health check failed — may need restart"
    WARN=1
  fi
fi

if [[ "$FAIL" -ne 0 ]]; then
  echo "Chaos redis/rabbit: FAILED"
  exit 1
fi
echo "Chaos redis/rabbit: PASSED"
