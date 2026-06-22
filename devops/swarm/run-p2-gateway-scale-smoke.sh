#!/usr/bin/env bash
# P2-Gateway — scale smoke (2+ replicas, BFF shared Redis, gateway-trust)
# Usage: bash devops/swarm/run-p2-gateway-scale-smoke.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

BASE_URL="${BASE_URL:-http://localhost:3000}"
FAIL=0

pass() { echo "[PASS] $1"; }
fail() { echo "[FAIL] $1"; FAIL=1; }

echo "=== P2 Gateway scale smoke ==="
echo "BASE_URL=$BASE_URL"

echo ""
echo "=== 1) Replica count ==="
GW_REPLICAS="$(docker service ls --filter name=voicehub_api-gateway --format '{{.Replicas}}' 2>/dev/null || echo '?')"
echo "voicehub_api-gateway replicas: $GW_REPLICAS"
if [[ "$GW_REPLICAS" == 2/2 ]] || [[ "$GW_REPLICAS" == 3/3 ]] || [[ "$GW_REPLICAS" == *"/"* && "${GW_REPLICAS%%/*}" -ge 2 ]]; then
  pass "API_GATEWAY_REPLICAS>=2 running ($GW_REPLICAS)"
else
  fail "Expected API_GATEWAY_REPLICAS>=2, got $GW_REPLICAS"
fi

RUNNING="$(docker service ps voicehub_api-gateway --filter desired-state=running --format '{{.Name}}' 2>/dev/null | wc -l | tr -d ' ')"
echo "Running tasks: $RUNNING"
if [[ "${RUNNING:-0}" -ge 2 ]]; then
  pass "At least 2 gateway tasks running"
else
  fail "Fewer than 2 gateway tasks running ($RUNNING)"
fi

echo ""
echo "=== 2) Health + gateway-trust (ingress LB) ==="
if curl -sf -m 5 "${BASE_URL}/health" >/dev/null; then
  pass "GET /health"
else
  fail "GET /health"
fi

TRUST="$(curl -sf -m 5 "${BASE_URL}/api/health/gateway-trust" 2>/dev/null || echo '{}')"
if echo "$TRUST" | grep -q '"success":true'; then
  pass "GET /api/health/gateway-trust"
else
  fail "GET /api/health/gateway-trust — $TRUST"
fi
if echo "$TRUST" | grep -q '"gatewayTrustConfigured":true'; then
  pass "GATEWAY_INTERNAL_TOKEN configured"
else
  fail "gatewayTrustConfigured not true"
fi

echo ""
echo "=== 3) Load burst (post-scale p95) ==="
ok=0
latencies=()
for i in $(seq 1 20); do
  start_ms="$(date +%s%3N 2>/dev/null || python -c 'import time; print(int(time.time()*1000))')"
  if curl -sf -o /dev/null -m 5 "${BASE_URL}/health" 2>/dev/null; then
    ok=$((ok + 1))
    end_ms="$(date +%s%3N 2>/dev/null || python -c 'import time; print(int(time.time()*1000))')"
    latencies+=("$((end_ms - start_ms))")
  fi
done
echo "Health burst: ok=$ok/20"
if [[ "$ok" -eq 20 ]]; then
  pass "Gateway health burst 20/20"
else
  fail "Gateway health burst $ok/20"
fi
if [[ ${#latencies[@]} -gt 0 ]]; then
  sorted="$(printf '%s\n' "${latencies[@]}" | sort -n)"
  p95_idx=$(( (${#latencies[@]} * 95 + 99) / 100 - 1 ))
  [[ "$p95_idx" -lt 0 ]] && p95_idx=0
  p95="$(echo "$sorted" | sed -n "$((p95_idx + 1))p")"
  echo "Gateway /health p95 ~ ${p95}ms (compare docs/phase2-replica-inventory-staging.md baseline ~323ms)"
fi

echo ""
echo "=== 4) BFF shared Redis across gateway replicas ==="
GW_IDS=($(docker ps -q -f name=voicehub_api-gateway 2>/dev/null | head -2))
if [[ ${#GW_IDS[@]} -lt 2 ]]; then
  fail "Need 2 gateway containers for BFF cross-replica test (found ${#GW_IDS[@]})"
else
  GW_A="${GW_IDS[0]}"
  GW_B="${GW_IDS[1]}"
  SMOKE_KEY="bff:p2-smoke:$(date +%s)"
  docker exec "$GW_A" node -e "
const { connectBffRedis, setCachedJson } = require('./src/bff/cache');
connectBffRedis();
setCachedJson('${SMOKE_KEY}', { replica: 'A', ts: Date.now() }, 120)
  .then(() => process.exit(0))
  .catch(e => { console.error(e.message); process.exit(1); });
" >/dev/null 2>&1 && pass "Replica A wrote BFF cache key" || fail "Replica A BFF write"

  READ_B="$(docker exec "$GW_B" node -e "
const { connectBffRedis, getCachedJson } = require('./src/bff/cache');
connectBffRedis();
getCachedJson('${SMOKE_KEY}')
  .then(v => { console.log(JSON.stringify(v)); process.exit(v && v.replica === 'A' ? 0 : 1); })
  .catch(e => { console.error(e.message); process.exit(1); });
" 2>/dev/null || echo '')"
  if echo "$READ_B" | grep -q '"replica":"A"'; then
    pass "Replica B read cache written by A (shared Redis)"
  else
    fail "Replica B could not read BFF key from A — $READ_B"
  fi
fi

echo ""
echo "=== 5) Auth routing + pagination guard (via ingress) ==="
LOGIN_RESP="$(curl -sS -m 10 -X POST "${BASE_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"p2-smoke-invalid@test.local","password":"wrong"}' 2>/dev/null || echo '{}')"
if echo "$LOGIN_RESP" | grep -q 'AUTH_INVALID_CREDENTIALS'; then
  pass "POST /api/auth/login routed (invalid creds → AUTH_INVALID_CREDENTIALS)"
else
  fail "POST /api/auth/login unexpected: $LOGIN_RESP"
fi

PAGINATED="$(curl -sS -m 10 "${BASE_URL}/api/organizations/my" 2>/dev/null || echo '{}')"
if echo "$PAGINATED" | grep -qi 'No token provided'; then
  pass "GET /api/organizations/my requires JWT (pagination/auth guard)"
else
  fail "Protected route guard unexpected: $PAGINATED"
fi

echo ""
echo "=== 6) Auth bootstrap cache header (optional — needs JWT) ==="
if [[ -n "${P2_GATEWAY_JWT:-}" ]]; then
  H1="$(curl -sS -m 15 -H "Authorization: Bearer ${P2_GATEWAY_JWT}" "${BASE_URL}/api/bootstrap" -D - -o /dev/null | tr -d '\r' | grep -i '^X-Bff-Cache:' || true)"
  H2="$(curl -sS -m 15 -H "Authorization: Bearer ${P2_GATEWAY_JWT}" "${BASE_URL}/api/bootstrap" -D - -o /dev/null | tr -d '\r' | grep -i '^X-Bff-Cache:' || true)"
  echo "Bootstrap pass 1: ${H1:-no header}"
  echo "Bootstrap pass 2: ${H2:-no header}"
  if echo "$H2" | grep -qi 'HIT'; then
    pass "BFF bootstrap cache HIT on second request"
  else
    fail "Expected X-Bff-Cache: HIT on second bootstrap request"
  fi
else
  echo "[SKIP] Set P2_GATEWAY_JWT to verify /api/bootstrap cache HIT (login manually)"
fi

echo ""
echo "=== 7) Restart stability (10s sample) ==="
sleep 10
GW_AFTER="$(docker service ls --filter name=voicehub_api-gateway --format '{{.Replicas}}' 2>/dev/null || echo '?')"
if [[ "$GW_AFTER" == "$GW_REPLICAS" ]]; then
  pass "Replica count stable after 10s ($GW_AFTER)"
else
  fail "Replica count changed $GW_REPLICAS -> $GW_AFTER"
fi

echo ""
if [[ "$FAIL" -eq 0 ]]; then
  echo "P2 gateway scale smoke: PASSED"
  exit 0
fi
echo "P2 gateway scale smoke: FAILED"
exit 1
