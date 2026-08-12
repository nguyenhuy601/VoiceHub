#!/usr/bin/env bash
# Deploy optional Prometheus + node-exporter stack (P2-Obs)
# Usage: bash devops/swarm/observability/deploy-observability-stack.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STACK_NAME="${OBS_STACK_NAME:-voicehub-obs}"

if ! docker info --format '{{.Swarm.LocalNodeState}}' 2>/dev/null | grep -q active; then
  echo "[FAIL] Docker Swarm not active"
  exit 1
fi

docker stack deploy -c "$SCRIPT_DIR/docker-compose.observability.yml" "$STACK_NAME"

echo ""
echo "Deployed stack: $STACK_NAME"
echo "Prometheus UI: http://127.0.0.1:9090 (host mode — staging only, not public)"
echo "Export metrics: bash devops/swarm/observability/export-swarm-metrics.sh"
docker stack services "$STACK_NAME" 2>/dev/null || true
