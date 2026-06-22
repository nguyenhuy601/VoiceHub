#!/usr/bin/env bash
# P1-Redis-A — Deploy Redis Sentinel overlay trên Swarm
# Usage: bash devops/swarm/redis-sentinel/deploy-sentinel-stack.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

STACK_NAME="${REDIS_SENTINEL_STACK_NAME:-voicehub-redis}"
COMPOSE_FILE="$ROOT/devops/swarm/redis-sentinel/docker-compose.sentinel.yml"
NETWORK_NAME="${ENTERPRISE_NETWORK_NAME:-voicehub_enterprise-network}"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

if [[ -z "${REDIS_PASSWORD:-}" ]]; then
  echo "[FAIL] Set REDIS_PASSWORD in root .env before deploy" >&2
  exit 1
fi

bash "$ROOT/devops/scripts/normalize-sh-lf.sh"

if ! docker network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
  echo "[FAIL] Overlay network $NETWORK_NAME not found — deploy main stack first" >&2
  exit 1
fi

echo "Deploying Redis Sentinel stack: $STACK_NAME (network=$NETWORK_NAME)"
export ENTERPRISE_NETWORK_NAME="$NETWORK_NAME"
docker stack deploy -c "$COMPOSE_FILE" "$STACK_NAME"

echo "Waiting for tasks..."
sleep 8
docker stack services "$STACK_NAME"
docker stack ps "$STACK_NAME" --no-trunc | head -20

echo ""
echo "[OK] Redis Sentinel stack deployed"
echo "Client cutover (P1-Redis-B): REDIS_SENTINELS=redis-sentinel-1:26379,redis-sentinel-2:26379,redis-sentinel-3:26379"
echo "                           REDIS_SENTINEL_NAME=mymaster"
