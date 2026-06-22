#!/usr/bin/env bash
# S3 — Realtime HA checklist (realtime-ha-checklist.md)
# Chạy: bash devops/swarm/run-realtime-ha-checklist.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

STACK_NAME="${STACK_NAME:-voicehub}"
FAIL=0
WARN=0

value_for_key() {
  local file="$1" key="$2"
  [[ -f "$file" ]] || return 0
  { grep -E "^${key}=" "$file" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'"; } || true
}

echo "=== S3 Realtime HA — config ==="

replicas="$(value_for_key ".env" "SOCKET_SERVICE_REPLICAS")"
adapter="$(value_for_key ".env" "SOCKET_IO_REDIS_ADAPTER")"

if [[ -z "$replicas" ]] || [[ "$replicas" -lt 2 ]]; then
  echo "[FAIL] .env: SOCKET_SERVICE_REPLICAS must be >= 2 (got: ${replicas:-unset})"
  FAIL=1
else
  echo "[OK] SOCKET_SERVICE_REPLICAS=$replicas"
fi

if [[ "$adapter" == "false" ]] || [[ "$adapter" == "0" ]]; then
  echo "[FAIL] .env: SOCKET_IO_REDIS_ADAPTER must be true for HA"
  FAIL=1
else
  echo "[OK] SOCKET_IO_REDIS_ADAPTER=${adapter:-true (default)}"
fi

if grep -q 'replicas: \${SOCKET_SERVICE_REPLICAS:-2}' docker-stack.yml 2>/dev/null; then
  echo "[OK] docker-stack.yml defaults SOCKET_SERVICE_REPLICAS to 2"
else
  echo "[WARN] docker-stack.yml socket replicas default may differ"
  WARN=1
fi

redis_sentinels="$(value_for_key ".env" "REDIS_SENTINELS")"
redis_host="$(value_for_key ".env" "REDIS_HOST")"
redis_port="$(value_for_key ".env" "REDIS_PORT")"
redis_url="$(value_for_key ".env" "REDIS_URL")"
if [[ -n "$redis_sentinels" ]]; then
  echo "[OK] Redis Sentinel: ${redis_sentinels}"
elif [[ -n "$redis_url" ]]; then
  echo "[OK] Redis REDIS_URL configured"
elif [[ -n "$redis_host" ]]; then
  echo "[OK] Redis target ${redis_host}:${redis_port:-6379}"
else
  echo "[WARN] REDIS_HOST / REDIS_SENTINELS / REDIS_URL unset — adapter needs Redis"
  WARN=1
fi

if grep -q 'buildNodeRedisClientOptions' services/socket-service/src/server.js 2>/dev/null; then
  echo "[OK] socket-service uses shared Redis connection profile"
else
  echo "[WARN] socket-service may not use Sentinel-aware adapter config"
  WARN=1
fi

echo ""
echo "=== S3 Realtime HA — runtime ==="

if docker stack services "${STACK_NAME}" 2>/dev/null | grep -q socket-service; then
  echo "Swarm stack ${STACK_NAME} detected"
  desired="$(docker service inspect "${STACK_NAME}_socket-service" --format '{{.Spec.Mode.Replicated.Replicas}}' 2>/dev/null || echo 0)"
  running="$(docker service ps "${STACK_NAME}_socket-service" --filter desired-state=running --format '{{.ID}}' 2>/dev/null | wc -l | tr -d ' ')"
  echo "socket-service desired=$desired running=$running"
  if [[ "$desired" -lt 2 ]]; then
    echo "[FAIL] Swarm socket-service replicas < 2"
    FAIL=1
  else
    echo "[OK] Swarm socket-service replicas >= 2"
  fi
  SOCKET_CURL_TARGET="${STACK_NAME}_socket-service"
elif docker ps --format '{{.Names}}' | grep -qE 'socket-service|enterprise-socket-service'; then
  SOCKET_CONTAINER="$(docker ps --format '{{.Names}}' | grep -E 'socket-service|enterprise-socket-service' | head -1)"
  echo "Compose socket container: $SOCKET_CONTAINER (single replica — HA scale on Swarm)"
  SOCKET_CURL_TARGET="$SOCKET_CONTAINER"
  WARN=1
else
  echo "[WARN] No socket-service container/stack — skip runtime health"
  WARN=1
  SOCKET_CURL_TARGET=""
fi

if [[ -n "$SOCKET_CURL_TARGET" ]]; then
  health_json=""
  socket_health_curl() {
    local cid="$1"
    docker exec "$cid" node -e "
      const http=require('http');
      http.get('http://127.0.0.1:3017/health',(res)=>{let d='';res.on('data',(c)=>d+=c);res.on('end',()=>process.stdout.write(d));})
        .on('error',()=>process.exit(1));
    " 2>/dev/null || true
  }
  if docker stack services "${STACK_NAME}" 2>/dev/null | grep -q socket-service; then
    task_id="$(docker service ps "${STACK_NAME}_socket-service" --filter desired-state=running -q | head -1)"
    if [[ -n "$task_id" ]]; then
      container_id="$(docker inspect "$task_id" --format '{{.Status.ContainerStatus.ContainerID}}' 2>/dev/null || true)"
      if [[ -n "$container_id" ]]; then
        health_json="$(socket_health_curl "$container_id")"
      fi
    fi
  else
    health_json="$(socket_health_curl "$SOCKET_CURL_TARGET")"
  fi
  if [[ -z "$health_json" ]]; then
    health_json="$(curl -sf http://127.0.0.1:3017/health 2>/dev/null || true)"
  fi
  if echo "$health_json" | grep -q '"redisAdapter":true'; then
    echo "[OK] socket-service /health reports redisAdapter=true"
  elif echo "$health_json" | grep -q '"status":"ok"'; then
    echo "[WARN] socket-service up but redisAdapter not true — check REDIS_* and logs"
    WARN=1
  else
    echo "[WARN] Could not read socket-service /health"
    WARN=1
  fi
fi

echo ""
echo "=== Manual (staging sign-off) ==="
echo "1. Mở 2 browser clients, login 2 user"
echo "2. docker service update --force ${STACK_NAME}_socket-service  (hoặc restart 1 socket task)"
echo "3. Verify: reconnect, presence, DM delivery"
echo "   Gateway WS: curl -sI http://localhost:3000/socket.io/?EIO=4&transport=polling | head -1"

if [[ "$FAIL" -ne 0 ]]; then
  echo ""
  echo "Realtime HA checklist: FAILED"
  exit 1
fi

echo ""
if [[ "$WARN" -ne 0 ]]; then
  echo "Realtime HA checklist: PASSED with warnings"
else
  echo "Realtime HA checklist: PASSED"
fi
