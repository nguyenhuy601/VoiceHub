#!/usr/bin/env bash
# P1-Cutover — orchestration: HA infra + app stack (no single-node mongodb/redis/rabbit)
# Usage: bash devops/swarm/deploy-phase1-cutover.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "=== P1-Cutover — Swarm stack cutover ==="

if ! docker info 2>/dev/null | grep -q 'Swarm: active'; then
  echo "[FAIL] Docker Swarm not active" >&2
  exit 1
fi

bash devops/swarm/phase1-pre-cutover-snapshot.sh

echo ""
echo "Step 1/4 — Deploy app stack (creates overlay network if missing)..."
DEPLOY_HA_INFRA=0 bash devops/swarm/deploy-stack.sh

echo ""
echo "Step 2/4 — Deploy Redis Sentinel stack..."
bash devops/swarm/redis-sentinel/deploy-sentinel-stack.sh

echo ""
echo "Step 3/4 — Deploy RabbitMQ cluster stack..."
bash devops/swarm/rabbitmq-cluster/deploy-cluster-stack.sh

echo ""
echo "Step 4/4 — Rolling update app services with Phase 1 env..."
bash devops/swarm/rolling-update-phase1-env.sh

echo ""
echo "=== Cutover deploy finished ==="
echo "Verify:"
echo "  docker stack services voicehub"
echo "  docker stack services voicehub-redis"
echo "  docker stack services voicehub-rabbit"
echo "  bash devops/scripts/check-security-env.sh"
echo "Smoke: login, DM, notification — xem devops/swarm/cutover-runbook.md"
