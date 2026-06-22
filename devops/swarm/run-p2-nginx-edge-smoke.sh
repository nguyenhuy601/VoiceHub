#!/usr/bin/env bash
# P2-Edge — Nginx TLS staging smoke
# Usage: bash devops/swarm/run-p2-nginx-edge-smoke.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

BASE_URL="${BASE_URL:-https://voicehub.local}"
NGINX_PREFIX="${NGINX_PREFIX:-$ROOT/devops/nginx}"
FAIL=0

pass() { echo "[PASS] $1"; }
fail() { echo "[FAIL] $1"; FAIL=1; }
skip() { echo "[SKIP] $1"; }

echo "=== P2 Nginx edge smoke ==="
echo "BASE_URL=$BASE_URL"

echo ""
echo "=== 1) TRUST_PROXY + client env (wave-1b) ==="
if grep -qE '^TRUST_PROXY=1' api-gateway/.env 2>/dev/null; then
  pass "api-gateway/.env TRUST_PROXY=1"
else
  fail "Set TRUST_PROXY=1 in api-gateway/.env"
fi

for pair in "VITE_API_URL=/api" "VITE_SOCKET_USE_GATEWAY=true" "VITE_HMR_HOST=voicehub.local" "VITE_HMR_PROTOCOL=wss" "VITE_HMR_CLIENT_PORT=443"; do
  key="${pair%%=*}"
  val="${pair#*=}"
  if grep -qE "^${key}=${val}" client/.env 2>/dev/null; then
    pass "client/.env $key"
  else
    fail "client/.env missing or wrong: $key=$val"
  fi
done

echo ""
echo "=== 2) Nginx configs syntax ==="
if command -v nginx >/dev/null 2>&1; then
  nginx -t -p "$NGINX_PREFIX" -c dev-https.conf >/dev/null 2>&1 && pass "dev-https.conf syntax OK" || fail "dev-https.conf nginx -t"
  nginx -t -p "$NGINX_PREFIX" -c staging-swarm-edge.conf >/dev/null 2>&1 && pass "staging-swarm-edge.conf syntax OK" || fail "staging-swarm-edge.conf nginx -t"
else
  skip "nginx not in PATH — syntax check skipped"
fi

if [[ -f "$NGINX_PREFIX/certs/voicehub.local+3.pem" ]]; then
  pass "mkcert staging cert present"
else
  fail "Missing $NGINX_PREFIX/certs/voicehub.local+3.pem — run mkcert-setup.ps1"
fi

echo ""
echo "=== 3) Gateway reachable (direct) ==="
if curl -sf -m 5 http://localhost:3000/health >/dev/null 2>&1; then
  pass "api-gateway :3000 /health"
else
  fail "api-gateway :3000 not reachable — deploy Swarm stack first"
fi

GW_REP="$(docker service ls --filter name=voicehub_api-gateway --format '{{.Replicas}}' 2>/dev/null || echo '?')"
if [[ "$GW_REP" == *"/"* && "${GW_REP%%/*}" -ge 2 ]]; then
  pass "API_GATEWAY_REPLICAS>=2 ($GW_REP)"
else
  fail "Expected gateway 2+ replicas for P2 edge, got $GW_REP"
fi

echo ""
echo "=== 4) HTTPS edge (Nginx + optional Vite) ==="
if curl -skf -m 5 "${BASE_URL}/api/health/gateway-trust" >/dev/null 2>&1; then
  pass "HTTPS ${BASE_URL}/api/health/gateway-trust"
else
  echo "[HINT] Start edge: devops/nginx/start-lan-https-dev.bat or:"
  echo "  nginx -p $NGINX_PREFIX -c dev-https.conf"
  echo "  cd client && npm run dev -- --port 5173"
  fail "HTTPS edge not reachable at $BASE_URL"
fi

echo ""
echo "=== 5) Full LAN verify script ==="
if bash devops/nginx/verify-lan-https.sh "$BASE_URL"; then
  pass "verify-lan-https.sh"
else
  fail "verify-lan-https.sh"
fi

echo ""
if [[ "$FAIL" -eq 0 ]]; then
  echo "P2 nginx edge smoke: PASSED"
  exit 0
fi
echo "P2 nginx edge smoke: FAILED"
exit 1
