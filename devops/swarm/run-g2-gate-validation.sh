#!/usr/bin/env bash
# Gate G2 — Phase 2 → Phase 3+ validation wrapper
# Usage: bash devops/swarm/run-g2-gate-validation.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u)"
LOG="${G2_VALIDATION_LOG:-backup/g2-validation-$(date +%Y%m%d-%H%M%S).log}"
mkdir -p "$(dirname "$LOG")"
exec > >(tee -a "$LOG") 2>&1

echo "=== Gate G2 validation ($STAMP) ==="
echo "Log: $LOG"

echo ""
echo "=== Phase 2 plan artifacts ==="
for f in \
  docs/phase2-replica-inventory-staging.md \
  docs/ha-baseline-staging-phase2-2026-06.md \
  docs/voice-swarm-scale-strategy.md \
  docs/phase2-observability-staging.md \
  docs/lan-https-voicehub.local.md
do
  [[ -f "$f" ]] && echo "[OK] $f" || { echo "[FAIL] missing $f"; exit 1; }
done

echo ""
echo "=== Scaled services ==="
docker service ls --format '{{.Name}} {{.Replicas}}' 2>/dev/null | grep -E 'api-gateway|socket-service' || true

echo ""
echo "=== P2 combined validation ==="
P2_VALIDATION_SKIP_DRAIN="${P2_VALIDATION_SKIP_DRAIN:-1}" bash devops/swarm/run-p2-scale-validation.sh

echo ""
echo "Gate G2 automated checks: PASSED"
echo "Record sign-off: docs/phase-gate-2026-06-22-g2.md"
