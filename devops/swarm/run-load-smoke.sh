#!/usr/bin/env bash
# S3 — Load smoke (load-chaos-validation.md pass criteria — automated infra subset)
# Chạy: bash devops/swarm/run-load-smoke.sh
# BASE_URL=http://localhost:3000 BURST=30 bash devops/swarm/run-load-smoke.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

BASE_URL="${BASE_URL:-http://localhost:3000}"
BURST="${BURST:-20}"
FAIL=0

echo "=== Load smoke — gateway health burst ==="
echo "BASE_URL=$BASE_URL BURST=$BURST"

ok=0
fail=0
latencies=()

for i in $(seq 1 "$BURST"); do
  start_ms="$(date +%s%3N 2>/dev/null || python -c 'import time; print(int(time.time()*1000))')"
  if curl -sf -o /dev/null -m 5 "${BASE_URL}/health" 2>/dev/null; then
    ok=$((ok + 1))
    end_ms="$(date +%s%3N 2>/dev/null || python -c 'import time; print(int(time.time()*1000))')"
    latencies+=("$((end_ms - start_ms))")
  else
    fail=$((fail + 1))
  fi
done

echo "Health burst: ok=$ok fail=$fail"
if [[ "$fail" -gt 0 ]]; then
  echo "[FAIL] Gateway health failures during burst"
  FAIL=1
fi

if [[ ${#latencies[@]} -gt 0 ]]; then
  sorted="$(printf '%s\n' "${latencies[@]}" | sort -n)"
  p95_idx=$(( (${#latencies[@]} * 95 + 99) / 100 - 1 ))
  [[ "$p95_idx" -lt 0 ]] && p95_idx=0
  p95="$(echo "$sorted" | sed -n "$((p95_idx + 1))p")"
  echo "Gateway /health p95 ~ ${p95}ms (baseline compare: docs/perf-baseline-staging-*.md)"
fi

echo ""
echo "=== Socket.IO polling probe ==="
poll_code="$(curl -s -o /dev/null -w '%{http_code}' -m 10 \
  "${BASE_URL}/socket.io/?EIO=4&transport=polling" 2>/dev/null || echo 000)"
if [[ "$poll_code" == "200" ]] || [[ "$poll_code" == "400" ]]; then
  echo "[OK] /socket.io reachable (HTTP $poll_code — 400 OK for bare handshake)"
else
  echo "[FAIL] /socket.io probe HTTP $poll_code"
  FAIL=1
fi

echo ""
echo "=== Core services running ==="
core_up=0
for svc in api-gateway socket-service redis rabbitmq chat-service; do
  if docker ps --format '{{.Names}}' | grep -qiE "${svc}|enterprise-${svc}"; then
    core_up=$((core_up + 1))
  fi
done
if [[ "$core_up" -ge 4 ]]; then
  echo "[OK] Core stack containers up ($core_up matched)"
else
  echo "[WARN] Some core containers missing (matched $core_up)"
  FAIL=1
fi

echo ""
echo "=== Manual load scenarios (staging sign-off) ==="
cat <<'EOF'
- Burst org channel messages (2+ users)
- Upload batch → task-file-worker
- AI extract/sync jobs
- Webhook burst (friend/task events)
- 2–5 concurrent voice rooms — new join succeeds
EOF

echo ""
echo "=== Rollback smoke ==="
echo "docker service update --rollback ${STACK_NAME:-voicehub}_socket-service"
echo "docker stack deploy -c docker-stack.yml ${STACK_NAME:-voicehub}"

if [[ "$FAIL" -ne 0 ]]; then
  echo "Load smoke: FAILED"
  exit 1
fi
echo "Load smoke: PASSED (automated subset)"
