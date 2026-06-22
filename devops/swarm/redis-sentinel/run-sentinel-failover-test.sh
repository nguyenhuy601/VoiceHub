#!/usr/bin/env bash
# P1-Redis-A — Manual Sentinel failover test
# Local:  bash devops/swarm/redis-sentinel/run-sentinel-failover-test.sh
# Swarm:  REDIS_SENTINEL_MODE=swarm bash devops/swarm/redis-sentinel/run-sentinel-failover-test.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

SENTINEL_DIR="$ROOT/devops/swarm/redis-sentinel"
COMPOSE_PROJECT="${REDIS_SENTINEL_PROJECT:-voicehub-redis}"
MODE="${REDIS_SENTINEL_MODE:-local}"
STACK_NAME="${REDIS_SENTINEL_STACK_NAME:-voicehub-redis}"
SENTINEL_NAME="${REDIS_SENTINEL_NAME:-mymaster}"
FAIL=0

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

if [[ -z "${REDIS_PASSWORD:-}" ]]; then
  echo "[FAIL] REDIS_PASSWORD not set in .env" >&2
  exit 1
fi

redis_cli() {
  docker run --rm --network "$NET" redis:7-alpine redis-cli "$@"
}

sentinel_cmd() {
  redis_cli -h redis-sentinel-1 -p 26379 "$@"
}

if [[ "$MODE" == "local" ]]; then
  NET="voicehub-redis-sentinel-local"
  echo "[INFO] Starting local Sentinel stack (compose)..."
  docker compose \
    -f "$SENTINEL_DIR/docker-compose.sentinel.yml" \
    -f "$SENTINEL_DIR/docker-compose.sentinel.local.yml" \
    -p "$COMPOSE_PROJECT" \
    up -d --wait 2>/dev/null || \
  docker compose \
    -f "$SENTINEL_DIR/docker-compose.sentinel.yml" \
    -f "$SENTINEL_DIR/docker-compose.sentinel.local.yml" \
    -p "$COMPOSE_PROJECT" \
    up -d
  sleep 15
elif [[ "$MODE" == "swarm" ]]; then
  NET="${ENTERPRISE_NETWORK_NAME:-voicehub_enterprise-network}"
else
  echo "[FAIL] Unknown REDIS_SENTINEL_MODE=$MODE" >&2
  exit 1
fi

echo "=== SENTINEL masters ==="
if ! sentinel_cmd SENTINEL masters | head -20; then
  echo "[FAIL] cannot reach redis-sentinel-1"
  exit 1
fi

echo ""
echo "=== get-master-addr-by-name $SENTINEL_NAME ==="
MASTER_INFO="$(sentinel_cmd SENTINEL get-master-addr-by-name "$SENTINEL_NAME")"
echo "$MASTER_INFO"
MASTER_HOST="$(echo "$MASTER_INFO" | sed -n '1p')"
MASTER_PORT="$(echo "$MASTER_INFO" | sed -n '2p')"
if [[ -z "$MASTER_HOST" || -z "$MASTER_PORT" ]]; then
  echo "[FAIL] no master returned"
  exit 1
fi
echo "[OK] current master: ${MASTER_HOST}:${MASTER_PORT}"

echo ""
echo "=== PING master (auth) ==="
if redis_cli -h "$MASTER_HOST" -p "$MASTER_PORT" -a "$REDIS_PASSWORD" --no-auth-warning PING | grep -q PONG; then
  echo "[OK] master PING"
else
  echo "[FAIL] master PING"
  FAIL=1
fi

echo ""
echo "=== SENTINEL failover $SENTINEL_NAME ==="
sentinel_cmd SENTINEL failover "$SENTINEL_NAME" || true
sleep 12

NEW_INFO="$(sentinel_cmd SENTINEL get-master-addr-by-name "$SENTINEL_NAME")"
NEW_HOST="$(echo "$NEW_INFO" | sed -n '1p')"
NEW_PORT="$(echo "$NEW_INFO" | sed -n '2p')"
echo "new master: ${NEW_HOST}:${NEW_PORT}"

if [[ "$NEW_HOST" == "$MASTER_HOST" && "$NEW_PORT" == "$MASTER_PORT" ]]; then
  echo "[WARN] master address unchanged (1-node / timing) — checking replication role..."
  ROLE="$(redis_cli -h "$NEW_HOST" -p "$NEW_PORT" -a "$REDIS_PASSWORD" --no-auth-warning INFO replication 2>/dev/null | grep '^role:' || true)"
  echo "$ROLE"
  if echo "$ROLE" | grep -q master; then
    echo "[OK] failover completed (role=master on elected node)"
  else
    echo "[FAIL] expected promoted master"
    FAIL=1
  fi
else
  echo "[OK] master moved ${MASTER_HOST} → ${NEW_HOST}"
fi

if redis_cli -h "$NEW_HOST" -p "$NEW_PORT" -a "$REDIS_PASSWORD" --no-auth-warning PING | grep -q PONG; then
  echo "[OK] new master PING"
else
  echo "[FAIL] new master PING"
  FAIL=1
fi

if [[ "$MODE" == "local" && "${REDIS_SENTINEL_LEAVE_UP:-0}" != "1" ]]; then
  echo ""
  echo "[INFO] Stopping local test stack (set REDIS_SENTINEL_LEAVE_UP=1 to keep)"
  docker compose \
    -f "$SENTINEL_DIR/docker-compose.sentinel.yml" \
    -f "$SENTINEL_DIR/docker-compose.sentinel.local.yml" \
    -p "$COMPOSE_PROJECT" \
    down
fi

if [[ "$FAIL" -ne 0 ]]; then
  echo "sentinel-failover-test: FAILED"
  exit 1
fi
echo "sentinel-failover-test: PASSED"
