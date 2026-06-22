#!/usr/bin/env bash
# P2-Validation — Scale & load sign-off (combined)
# Usage:
#   bash devops/swarm/run-p2-scale-validation.sh
#   P2_VALIDATION_SKIP_DRAIN=1 bash devops/swarm/run-p2-scale-validation.sh  # skip 90s queue drain
#   P2_VALIDATION_LOG=backup/p2-validation-*.log bash devops/swarm/run-p2-scale-validation.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u)"
LOG="${P2_VALIDATION_LOG:-backup/p2-validation-$(date +%Y%m%d-%H%M%S).log}"
mkdir -p "$(dirname "$LOG")"
exec > >(tee -a "$LOG") 2>&1

FAIL=0
SKIP_DRAIN="${P2_VALIDATION_SKIP_DRAIN:-0}"

section() {
  echo ""
  echo "################################################################"
  echo "# $1"
  echo "################################################################"
}

run_step() {
  local name="$1"
  shift
  echo ""
  echo ">>> $name"
  if "$@"; then
    echo "[PASS] $name"
  else
    echo "[FAIL] $name"
    FAIL=1
  fi
}

section "P2-Validation — Scale & Load Sign-off ($STAMP)"
echo "Log: $LOG"
echo "SKIP_DRAIN=$SKIP_DRAIN"

section "0) Pre-check — scaled stack inventory"
docker stack ls 2>/dev/null || true
docker service ls --format '{{.Name}} {{.Replicas}}' 2>/dev/null | grep '^voicehub_' | head -30 || true

GW_REP="$(docker service ls --filter name=voicehub_api-gateway --format '{{.Replicas}}' 2>/dev/null || echo '?')"
SOC_REP="$(docker service ls --filter name=voicehub_socket-service --format '{{.Replicas}}' 2>/dev/null || echo '?')"
echo "api-gateway: $GW_REP  socket-service: $SOC_REP"
if [[ "$GW_REP" != *"/"* ]] || [[ "${GW_REP%%/*}" -lt 2 ]]; then
  echo "[FAIL] API_GATEWAY_REPLICAS must be >= 2 (got $GW_REP)"
  FAIL=1
else
  echo "[OK] Gateway scaled"
fi

section "1) Phase 1 regression subset (quick)"
run_step "P1 redis client smoke" node tests/p1-redis-client-cutover.smoke.js
run_step "P1 rabbit quorum smoke" node tests/p1-rabbit-quorum.smoke.js
run_step "P1 swarm cutover smoke" node tests/p1-swarm-cutover.smoke.js
run_step "Chaos queue baseline (dry)" env CHAOS_DRY_RUN=1 bash devops/swarm/run-chaos-redis-rabbit.sh

section "2) P2 component smokes"
run_step "P2 gateway scale smoke" bash devops/swarm/run-p2-gateway-scale-smoke.sh
run_step "Load smoke (gateway burst)" bash devops/swarm/run-load-smoke.sh
if [[ "$SKIP_DRAIN" == "1" ]]; then
  echo "[SKIP] P2 worker queue drain (P2_VALIDATION_SKIP_DRAIN=1)"
else
  run_step "P2 worker queue drain" bash devops/swarm/run-p2-worker-queue-drain.sh
fi
run_step "P2 observability baseline" bash devops/swarm/run-p2-observability-baseline.sh
run_step "P2 voice smoke (automated)" bash devops/swarm/run-p2-voice-smoke.sh
run_step "P2 static validation" node tests/p2-scale-validation.smoke.js

section "3) Socket + gateway HA (scaled)"
run_step "P2 socket-gateway HA" bash devops/swarm/run-p2-socket-gateway-ha.sh

section "4) Edge TLS (if Nginx up)"
if curl -skf -m 5 https://voicehub.local/api/health/gateway-trust >/dev/null 2>&1; then
  run_step "P2 nginx edge smoke" bash devops/swarm/run-p2-nginx-edge-smoke.sh
else
  echo "[SKIP] HTTPS edge not reachable — start Nginx or WAIVE for G2"
fi

section "5) Security env"
if [[ -f devops/scripts/check-security-env.sh ]]; then
  run_step "check-security-env.sh" env VOICEHUB_ENV_CHECK=staging bash devops/scripts/check-security-env.sh
else
  echo "[SKIP] check-security-env.sh not found"
fi

section "6) p95 vs P2-0 baseline"
echo "P2-0 baseline gateway p95 ~323ms (docs/phase2-replica-inventory-staging.md)"
echo "Post-scale target: within +/-20% (~258-388ms) or improved"
ok=0
latencies=()
for i in $(seq 1 20); do
  start_ms="$(date +%s%3N 2>/dev/null || python -c 'import time; print(int(time.time()*1000))')"
  if curl -sf -o /dev/null -m 5 http://localhost:3000/health 2>/dev/null; then
    ok=$((ok + 1))
    end_ms="$(date +%s%3N 2>/dev/null || python -c 'import time; print(int(time.time()*1000))')"
    latencies+=("$((end_ms - start_ms))")
  fi
done
if [[ ${#latencies[@]} -gt 0 ]]; then
  sorted="$(printf '%s\n' "${latencies[@]}" | sort -n)"
  p95_idx=$(( (${#latencies[@]} * 95 + 99) / 100 - 1 ))
  [[ "$p95_idx" -lt 0 ]] && p95_idx=0
  p95="$(echo "$sorted" | sed -n "$((p95_idx + 1))p")"
  echo "Final gateway p95 ~ ${p95}ms (ok=$ok/20)"
  if [[ "$p95" -le 388 ]]; then
    echo "[PASS] p95 within P2-0 +20% tolerance"
  else
    echo "[WARN] p95 ${p95}ms above +20% of 323ms baseline — review under load"
  fi
fi

section "Summary"
echo "Log: $LOG"
echo "Manual (load-chaos-validation.md): burst org chat, file upload, AI jobs, 2 voice rooms"
if [[ "$FAIL" -eq 0 ]]; then
  echo ""
  echo "P2 scale validation: ALL AUTOMATED STEPS PASSED"
  echo "Next: Gate G2 — docs/phase-gate-*-g2.md"
  exit 0
fi
echo ""
echo "P2 scale validation: FAILED — see log"
exit 1
