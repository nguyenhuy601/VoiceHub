#!/usr/bin/env bash
# P1-Validation — Failover chaos từng layer + combined smoke (sign-off Phase 1)
# Usage:
#   bash devops/swarm/run-p1-failover-validation.sh
#   P1_VALIDATION_DRY_RUN=1 bash devops/swarm/run-p1-failover-validation.sh
#   P1_VALIDATION_LOG=backup/p1-validation-$(date +%Y%m%d-%H%M%S).log bash devops/swarm/run-p1-failover-validation.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

STAMP="$(date +%Y-%m-%dT%H:%M:%S%z)"
LOG="${P1_VALIDATION_LOG:-backup/p1-validation-$(date +%Y%m%d-%H%M%S).log}"
mkdir -p "$(dirname "$LOG")"
exec > >(tee -a "$LOG") 2>&1

DRY="${P1_VALIDATION_DRY_RUN:-0}"
FAIL=0

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

section "P1-Validation — Failover & Sign-off ($STAMP)"
echo "Log: $LOG"
echo "DRY_RUN=$DRY"

section "0) Pre-check — stack inventory"
bash "$ROOT/devops/scripts/normalize-sh-lf.sh" 2>/dev/null || true
docker stack ls 2>/dev/null || echo "[WARN] Swarm not available"
docker stack services voicehub 2>/dev/null | head -25 || true
docker stack services voicehub-redis 2>/dev/null || echo "[WARN] voicehub-redis not deployed"
docker stack services voicehub-rabbit 2>/dev/null || echo "[WARN] voicehub-rabbit not deployed"

section "1) Atlas — URI audit + reconnect smoke"
if [[ "$DRY" == "1" ]]; then
  run_step "Atlas static" node tests/p1-atlas-migration.smoke.js
  run_step "Atlas URI audit" bash devops/scripts/phase1-atlas-uri-audit.sh
else
  run_step "Atlas failover smoke" env PHASE1_ATLAS_LIVE="${PHASE1_ATLAS_LIVE:-1}" P1_ATLAS_MONITOR_SEC="${P1_ATLAS_MONITOR_SEC:-30}" \
    bash devops/scripts/phase1-atlas-failover-smoke.sh
fi

section "2) Redis Sentinel — failover + realtime HA"
if [[ "$DRY" == "1" ]]; then
  run_step "Redis client cutover smoke" node tests/p1-redis-client-cutover.smoke.js
  run_step "Realtime HA config" bash devops/swarm/run-realtime-ha-checklist.sh
else
  run_step "Redis client cutover smoke" node tests/p1-redis-client-cutover.smoke.js
  if docker stack services voicehub-redis 2>/dev/null | grep -q redis-master; then
    run_step "Sentinel failover (swarm)" env REDIS_SENTINEL_MODE=swarm \
      bash devops/swarm/redis-sentinel/run-sentinel-failover-test.sh
  else
    run_step "Sentinel failover (local)" env REDIS_SENTINEL_LEAVE_UP=1 \
      bash devops/swarm/redis-sentinel/run-sentinel-failover-test.sh
  fi
  run_step "Realtime HA checklist" bash devops/swarm/run-realtime-ha-checklist.sh
fi

section "3) RabbitMQ cluster — kill 2/3 nodes + queue depth"
if [[ "$DRY" == "1" ]]; then
  echo "[SKIP] Rabbit chaos (dry run)"
else
  RABBIT_MODE="local"
  if docker stack services voicehub-rabbit 2>/dev/null | grep -q rabbitmq; then
    RABBIT_MODE="swarm"
  fi
  run_step "Rabbit 2/3 node kill" env RABBITMQ_CLUSTER_MODE="$RABBIT_MODE" RABBIT_KILL_NODES=2 \
    RABBITMQ_CLUSTER_LEAVE_UP=1 bash devops/swarm/rabbitmq-cluster/run-cluster-node-kill-test.sh
fi

section "4) Combined smoke — gateway burst + socket probe"
if [[ "$DRY" == "1" ]]; then
  echo "[SKIP] Load smoke (dry run)"
else
  run_step "Load smoke" bash devops/swarm/run-load-smoke.sh || true
fi

section "5) Manual sign-off checklist (record in docs/ha-baseline-staging-*.md)"
cat <<'EOF'
- [ ] Atlas UI primary step-down — login/DM/org OK within 5 min
- [ ] 2 browsers DM during Redis SENTINEL failover
- [ ] Upload file → task worker during Rabbit chaos
- [ ] 2 voice rooms concurrent join
- [ ] Rollback smoke: docker service update --rollback voicehub_<service>
EOF

section "Summary"
if [[ "$FAIL" -ne 0 ]]; then
  echo "P1-Validation: COMPLETED WITH FAILURES — see $LOG"
  echo "Fix blockers then re-run: bash devops/swarm/run-p1-failover-validation.sh"
  exit 1
fi
echo "P1-Validation: ALL AUTOMATED STEPS PASSED"
echo "Complete manual checklist above; update docs/ha-baseline-staging-YYYY-MM.md"
