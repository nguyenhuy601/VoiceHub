#!/usr/bin/env bash
# P2-Workers — manual scale in/out for Swarm queue workers (no autoscaler plugin)
# Usage:
#   bash devops/swarm/scale-workers.sh status
#   bash devops/swarm/scale-workers.sh up [N]      # default N=2 staging
#   bash devops/swarm/scale-workers.sh down        # reset to 1 (policy min)
#   bash devops/swarm/scale-workers.sh deploy      # apply .env *_WORKER_REPLICAS via stack deploy
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

TARGET="${2:-2}"
STACK="${SWARM_STACK_NAME:-voicehub}"

declare -a WORKER_SERVICES=(
  voicehub_project-worker
  voicehub_notification-dispatch-worker
  voicehub_webhook-delivery-worker
  voicehub_ai-task-extract-worker
  voicehub_ai-task-sync-worker
)

declare -A ENV_KEYS=(
  [voicehub_project-worker]=TASK_WORKER_REPLICAS
  [voicehub_notification-dispatch-worker]=NOTIFICATION_DISPATCH_WORKER_REPLICAS
  [voicehub_webhook-delivery-worker]=WEBHOOK_DELIVERY_WORKER_REPLICAS
  [voicehub_ai-task-extract-worker]=AI_TASK_EXTRACT_WORKER_REPLICAS
  [voicehub_ai-task-sync-worker]=AI_TASK_SYNC_WORKER_REPLICAS
)

# autoscale-policy.md guardrails (staging single-node)
MIN_REPLICAS=1
MAX_REPLICAS="${P2_WORKER_MAX_REPLICAS:-3}"

usage() {
  cat <<EOF
Usage: bash devops/swarm/scale-workers.sh <status|up|down|deploy> [replicas]

  status  — show worker service replicas + queue consumers
  up N    — docker service scale all workers to N (default 2)
  down    — scale all workers to min (1)
  deploy  — SWARM_USE_LOCAL_IMAGES=1 deploy-stack (apply .env replica vars)

Guardrails: min=$MIN_REPLICAS max=$MAX_REPLICAS (override max via P2_WORKER_MAX_REPLICAS)
EOF
}

clamp_replicas() {
  local n="$1"
  if [[ "$n" -lt "$MIN_REPLICAS" ]]; then
    echo "$MIN_REPLICAS"
  elif [[ "$n" -gt "$MAX_REPLICAS" ]]; then
    echo "$MAX_REPLICAS"
  else
    echo "$n"
  fi
}

cmd_status() {
  echo "=== Worker replicas ($STACK) ==="
  for svc in "${WORKER_SERVICES[@]}"; do
    docker service ls --filter "name=${svc}" --format "{{.Name}} {{.Replicas}}" 2>/dev/null || true
  done
  echo ""
  echo "=== .env overrides ==="
  for svc in "${WORKER_SERVICES[@]}"; do
    key="${ENV_KEYS[$svc]}"
    val="$(grep -E "^${key}=" "$ROOT/.env" 2>/dev/null | cut -d= -f2- || true)"
    echo "${key}=${val:-<stack default>}"
  done
  RAB="$(docker ps -q -f name=voicehub-rabbit_rabbitmq-1 | head -1 || true)"
  if [[ -n "$RAB" ]]; then
    echo ""
    echo "=== Queue depth (critical) ==="
    docker exec "$RAB" rabbitmqctl list_queues name messages consumers 2>/dev/null \
      | grep -E 'voicehub\.(friend|notification|webhook|task)|task-ai' || true
  fi
}

cmd_scale() {
  local n
  n="$(clamp_replicas "$1")"
  echo "Scaling workers to $n ..."
  for svc in "${WORKER_SERVICES[@]}"; do
    echo "  $svc -> $n"
    docker service scale "${svc}=${n}"
  done
  cmd_status
}

cmd_deploy() {
  echo "Deploying stack with .env worker replica vars..."
  SWARM_USE_LOCAL_IMAGES="${SWARM_USE_LOCAL_IMAGES:-1}" bash "$ROOT/devops/swarm/deploy-stack.sh"
  cmd_status
}

ACTION="${1:-status}"
case "$ACTION" in
  status) cmd_status ;;
  up) cmd_scale "$(clamp_replicas "$TARGET")" ;;
  down) cmd_scale "$MIN_REPLICAS" ;;
  deploy) cmd_deploy ;;
  -h|--help|help) usage ;;
  *)
    echo "[FAIL] Unknown action: $ACTION" >&2
    usage
    exit 1
    ;;
esac
