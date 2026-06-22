#!/usr/bin/env bash
# P2 socket + gateway HA — realtime checklist under scaled gateway
# Usage: bash devops/swarm/run-p2-socket-gateway-ha.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

STACK_NAME="${STACK_NAME:-voicehub}"
BASE_URL="${BASE_URL:-http://localhost:3000}"
FAIL=0

pass() { echo "[PASS] $1"; }
fail() { echo "[FAIL] $1"; FAIL=1; }

echo "=== P2 Socket + Gateway HA ==="
echo "BASE_URL=$BASE_URL STACK=$STACK_NAME"

echo ""
echo "=== 1) Realtime HA config (S3 baseline) ==="
if bash "$ROOT/devops/swarm/run-realtime-ha-checklist.sh"; then
  pass "run-realtime-ha-checklist.sh"
else
  fail "run-realtime-ha-checklist.sh"
fi

echo ""
echo "=== 2) Gateway replicas >= 2 ==="
GW_REP="$(docker service ls --filter name="${STACK_NAME}_api-gateway" --format '{{.Replicas}}' 2>/dev/null || echo '?')"
echo "api-gateway replicas: $GW_REP"
if [[ "$GW_REP" == *"/"* && "${GW_REP%%/*}" -ge 2 ]]; then
  pass "API_GATEWAY_REPLICAS>=2 ($GW_REP)"
else
  fail "Expected gateway >=2 replicas, got $GW_REP"
fi

echo ""
echo "=== 3) Socket.IO via gateway (ingress LB) ==="
poll_code="$(curl -s -o /dev/null -w '%{http_code}' -m 10 "${BASE_URL}/socket.io/?EIO=4&transport=polling" 2>/dev/null || echo 000)"
if [[ "$poll_code" == "200" ]]; then
  pass "GET /socket.io polling HTTP $poll_code"
else
  fail "/socket.io via gateway HTTP $poll_code"
fi

echo ""
echo "=== 4) Kill 1 socket task — recover ==="
BEFORE="$(docker service ps "${STACK_NAME}_socket-service" --filter desired-state=running -q 2>/dev/null | wc -l | tr -d ' ')"
docker service update --force "${STACK_NAME}_socket-service" >/dev/null 2>&1 || true
echo "Waiting for socket-service rolling update..."
sleep 25
AFTER="$(docker service ps "${STACK_NAME}_socket-service" --filter desired-state=running -q 2>/dev/null | wc -l | tr -d ' ')"
if [[ "${AFTER:-0}" -ge 2 ]]; then
  pass "socket-service running tasks after force-update ($AFTER)"
else
  fail "socket-service running=$AFTER after force-update (was $BEFORE)"
fi
poll_after="$(curl -s -o /dev/null -w '%{http_code}' -m 10 "${BASE_URL}/socket.io/?EIO=4&transport=polling" 2>/dev/null || echo 000)"
if [[ "$poll_after" == "200" ]]; then
  pass "Socket polling OK after socket task kill"
else
  fail "Socket polling HTTP $poll_after after socket kill"
fi

echo ""
echo "=== 5) Kill 1 gateway task — no prolonged 5xx ==="
failures=0
docker service update --force "${STACK_NAME}_api-gateway" >/dev/null 2>&1 || true
for i in $(seq 1 15); do
  if ! curl -sf -m 3 "${BASE_URL}/health" >/dev/null 2>&1; then
    failures=$((failures + 1))
  fi
  sleep 2
done
echo "Gateway /health failures during 30s window: $failures/15"
if [[ "$failures" -le 3 ]]; then
  pass "Gateway health recovered (failures=$failures <= 3)"
else
  fail "Gateway health failures spike ($failures/15)"
fi
GW_AFTER="$(docker service ls --filter name="${STACK_NAME}_api-gateway" --format '{{.Replicas}}' 2>/dev/null || echo '?')"
if [[ "$GW_AFTER" == "$GW_REP" ]]; then
  pass "Gateway replica count stable ($GW_AFTER)"
else
  fail "Gateway replicas changed $GW_REP -> $GW_AFTER"
fi

echo ""
echo "=== Manual sign-off ==="
echo "- 2 browsers DM during gateway force-update"
echo "- Presence/reconnect after socket kill"

echo ""
if [[ "$FAIL" -eq 0 ]]; then
  echo "P2 socket-gateway HA: PASSED"
  exit 0
fi
echo "P2 socket-gateway HA: FAILED"
exit 1
