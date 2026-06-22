#!/usr/bin/env bash
# S3 — Chạy toàn bộ validation (config + HA + chaos + load smoke)
# bash devops/swarm/run-s3-validation.sh
# Chỉ config/HA, không restart infra: CHAOS_DRY_RUN=1 bash devops/swarm/run-s3-validation.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "########## S3 socket-ha-config + realtime-ha-checklist ##########"
bash devops/swarm/run-realtime-ha-checklist.sh

echo ""
echo "########## S3 chaos-redis-rabbit ##########"
bash devops/swarm/run-chaos-redis-rabbit.sh

echo ""
echo "########## S3 load-smoke ##########"
bash devops/swarm/run-load-smoke.sh

echo ""
echo "########## S3 nginx-edge (optional config check) ##########"
if [[ -f devops/nginx/staging-swarm-edge.conf ]] && [[ -f devops/nginx/swarm-socket-sticky.conf ]]; then
  echo "[OK] staging-swarm-edge.conf + swarm-socket-sticky.conf present"
  if grep -q 'TRUST_PROXY' api-gateway/.env 2>/dev/null; then
    echo "[OK] api-gateway/.env has TRUST_PROXY"
  else
    echo "[WARN] Set TRUST_PROXY=1 in api-gateway/.env when Nginx edge terminates TLS"
  fi
else
  echo "[WARN] Nginx edge configs missing"
fi

echo ""
echo "S3 validation: ALL STEPS COMPLETED"
