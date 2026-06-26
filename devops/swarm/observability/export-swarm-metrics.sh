#!/usr/bin/env bash
# Prometheus textfile metrics — Swarm replicas + gateway p95 + Rabbit queues
# Called by observability/export-swarm-metrics.sh or metrics-writer sidecar.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
BASE_URL="${BASE_URL:-http://localhost:3000}"
BURST="${OBS_GATEWAY_BURST:-20}"

# Rabbit queues (prometheus format)
if [[ -x "$ROOT/devops/scripts/rabbit-queue-depth.sh" ]]; then
  bash "$ROOT/devops/scripts/rabbit-queue-depth.sh" --format prometheus
else
  bash "$SCRIPT_DIR/../../../devops/scripts/rabbit-queue-depth.sh" --format prometheus 2>/dev/null || true
fi

echo "# HELP voicehub_swarm_replica_gap desired minus running tasks"
echo "# TYPE voicehub_swarm_replica_gap gauge"
while IFS= read -r line; do
  name="$(echo "$line" | awk '{print $1}')"
  rep="$(echo "$line" | awk '{print $2}')"
  [[ "$name" != voicehub_* ]] && continue
  [[ "$rep" != */* ]] && continue
  desired="${rep%%/*}"
  running="${rep##*/}"
  gap=$((desired - running))
  [[ "$gap" -lt 0 ]] && gap=0
  svc="${name#voicehub_}"
  echo "voicehub_swarm_replica_gap{service=\"$svc\"} $gap"
done < <(docker service ls --format '{{.Name}} {{.Replicas}}' 2>/dev/null | grep '^voicehub_' || true)

echo "# HELP voicehub_swarm_task_failed_recent Failed tasks in last observability window"
echo "# TYPE voicehub_swarm_task_failed_recent gauge"
fail_count="$(docker stack ps voicehub --filter desired-state=shutdown --format '{{.Error}}' 2>/dev/null | grep -ciE 'fail|non-zero|oom' || echo 0)"
echo "voicehub_swarm_task_failed_recent $fail_count"

# Gateway p95
latencies=()
for i in $(seq 1 "$BURST"); do
  start_ms="$(date +%s%3N 2>/dev/null || python -c 'import time; print(int(time.time()*1000))')"
  if curl -sf -o /dev/null -m 5 "${BASE_URL}/health" 2>/dev/null; then
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
fi
echo "# HELP voicehub_gateway_health_p95_ms Gateway /health latency p95 ms"
echo "# TYPE voicehub_gateway_health_p95_ms gauge"
echo "voicehub_gateway_health_p95_ms $p95"
