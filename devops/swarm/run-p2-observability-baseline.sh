#!/usr/bin/env bash
# P2-Obs — full metrics baseline export + threshold checks
# Usage: bash devops/swarm/run-p2-observability-baseline.sh
#   OBS_WRITE_SNAPSHOT=1 bash devops/swarm/run-p2-observability-baseline.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

BASE_URL="${BASE_URL:-http://localhost:3000}"
OBS_WRITE_SNAPSHOT="${OBS_WRITE_SNAPSHOT:-0}"
FAIL=0
WARN=0

pass() { echo "[PASS] $1"; }
warn() { echo "[WARN] $1"; WARN=$((WARN + 1)); }
fail() { echo "[FAIL] $1"; FAIL=1; }

TS="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u)"
DATE_TAG="$(date -u +%Y-%m-%d 2>/dev/null || date +%Y-%m-%d)"
SNAP_DIR="$ROOT/backup/phase2-obs-${DATE_TAG}"

echo "=== P2 Observability baseline ==="
echo "timestamp=$TS BASE_URL=$BASE_URL"

echo ""
echo "=== 1) Swarm replicas (desired vs running) ==="
while IFS= read -r line; do
  name="$(echo "$line" | awk '{print $1}')"
  rep="$(echo "$line" | awk '{print $2}')"
  [[ "$name" != voicehub_* ]] && continue
  desired="${rep%%/*}"
  running="${rep##*/}"
  if [[ "$desired" -lt "$running" ]]; then
    warn "$name stale running>$desired (scale-down in progress?)"
  elif [[ "$desired" -gt "$running" ]]; then
    warn "$name gap desired=$desired running=$running"
  else
    pass "$name $rep"
  fi
done < <(docker service ls --format '{{.Name}} {{.Replicas}}' 2>/dev/null | grep '^voicehub_' || true)

echo ""
echo "=== 2) Recent task failures (voicehub stack) ==="
RECENT_FAIL="$(docker stack ps voicehub --no-trunc 2>/dev/null | grep -ciE 'Failed|non-zero exit|Shutdown.*error' || true)"
RECENT_FAIL="${RECENT_FAIL//$'\r'/}"
RECENT_FAIL="${RECENT_FAIL:-0}"
if [[ "$RECENT_FAIL" -le 3 ]]; then
  pass "Recent failed/shutdown tasks: $RECENT_FAIL (acceptable rolling update noise)"
else
  warn "Elevated failed tasks in stack ps: $RECENT_FAIL"
fi

OOM="$(docker stack ps voicehub --no-trunc 2>/dev/null | grep -ci OOMKilled || true)"
OOM="${OOM//$'\r'/}"
OOM="${OOM:-0}"
if [[ "$OOM" -eq 0 ]]; then
  pass "No OOMKilled in stack ps"
else
  fail "OOMKilled tasks detected: $OOM"
fi

echo ""
echo "=== 3) Rabbit queue depth ==="
if ! bash "$ROOT/devops/scripts/rabbit-queue-depth.sh" --format text; then
  fail "rabbit-queue-depth.sh"
fi

echo ""
echo "=== 4) Queue alert thresholds (autoscale-policy crossover) ==="
JSON_OUT="$(bash "$ROOT/devops/scripts/rabbit-queue-depth.sh" --format json)"
node -e "
const d = JSON.parse(process.argv[1]);
const thresholds = {
  'voicehub.friend.dm': { max: 20, sev: 'critical' },
  'task-ai.extract': { max: 100, sev: 'warn' },
  'task-ai.sync': { max: 100, sev: 'warn' },
  'voicehub.task.from_file': { max: 50, sev: 'warn' },
  'voicehub.notification.dispatch': { max: 200, sev: 'warn' },
  'voicehub.webhook.delivery': { max: 200, sev: 'warn' },
};
let warn = 0, fail = 0;
for (const q of d.queues || []) {
  const t = thresholds[q.name];
  if (!t) continue;
  const line = \`Queue \${q.name} depth=\${q.messages} consumers=\${q.consumers}\`;
  if (q.messages > t.max) {
    console.log((t.sev === 'critical' ? '[FAIL]' : '[WARN]') + ' ' + line + \` > \${t.max}\`);
    if (t.sev === 'critical') fail++; else warn++;
  } else {
    console.log('[PASS] ' + line + \` (<= \${t.max})\`);
  }
  if (/dispatch|webhook/.test(q.name) && q.consumers === 0) {
    console.log('[WARN] Queue ' + q.name + ' has 0 consumers');
    warn++;
  }
}
const dlq = (d.dlq || []).reduce((s, q) => s + (q.messages || 0), 0);
if (dlq > 0) { console.log('[WARN] DLQ messages total=' + dlq); warn++; }
else console.log('[PASS] DLQ empty');
process.exit(fail > 0 ? 2 : 0);
" "$JSON_OUT" || {
  qcheck=$?
  [[ "$qcheck" -eq 2 ]] && FAIL=1
  [[ "$qcheck" -eq 0 ]] || WARN=$((WARN + 1))
}

echo ""
echo "=== 5) Gateway /health p95 ==="
ok=0
latencies=()
BURST="${OBS_GATEWAY_BURST:-20}"
for i in $(seq 1 "$BURST"); do
  start_ms="$(date +%s%3N 2>/dev/null || python -c 'import time; print(int(time.time()*1000))')"
  if curl -sf -o /dev/null -m 5 "${BASE_URL}/health" 2>/dev/null; then
    ok=$((ok + 1))
    end_ms="$(date +%s%3N 2>/dev/null || python -c 'import time; print(int(time.time()*1000))')"
    latencies+=("$((end_ms - start_ms))")
  fi
done
p95=0
if [[ ${#latencies[@]} -gt 0 ]]; then
  sorted="$(printf '%s\n' "${latencies[@]}" | sort -n)"
  p95_idx=$(( (${#latencies[@]} * 95 + 99) / 100 - 1 ))
  [[ "$p95_idx" -lt 0 ]] && p95_idx=0
  p95="$(echo "$sorted" | sed -n "$((p95_idx + 1))p")"
  echo "Gateway burst ok=$ok/$BURST p95=${p95}ms"
  if [[ "$p95" -gt 500 ]]; then
    warn "Gateway p95 ${p95}ms > 500ms alert threshold"
  else
    pass "Gateway p95 ${p95}ms within threshold"
  fi
else
  fail "Gateway health burst failed"
fi

echo ""
echo "=== 6) Prometheus text export ==="
PROM_OUT="$(bash "$ROOT/devops/swarm/observability/export-swarm-metrics.sh" 2>/dev/null || true)"
if echo "$PROM_OUT" | grep -q voicehub_rabbit_queue_messages; then
  pass "Prometheus-format export includes queue metrics"
else
  fail "Prometheus export missing queue metrics"
fi

if [[ "$OBS_WRITE_SNAPSHOT" == "1" ]]; then
  mkdir -p "$SNAP_DIR"
  echo "$JSON_OUT" > "$SNAP_DIR/metrics.json"
  echo "$PROM_OUT" > "$SNAP_DIR/metrics.prom"
  {
    echo "timestamp=$TS"
    echo "gateway_p95_ms=$p95"
    echo "warnings=$WARN"
    echo "failures=$FAIL"
  } > "$SNAP_DIR/alert-status.txt"
  pass "Snapshot written to $SNAP_DIR"
fi

echo ""
if [[ "$FAIL" -eq 0 ]]; then
  echo "P2 observability baseline: PASSED (warnings=$WARN)"
  exit 0
fi
echo "P2 observability baseline: FAILED (warnings=$WARN)"
exit 1
