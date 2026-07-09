#!/usr/bin/env bash
# Rebuild toàn bộ image Swarm local + deploy stack + rolling recreate tasks.
# Staging/dev LAN — KHÔNG dùng docker-compose.swarm-extra.yml (chỉ infra AI bổ sung).
#
# Usage:
#   bash devops/swarm/rebuild-deploy-staging.sh
#   bash devops/swarm/rebuild-deploy-staging.sh --skip-build    # chỉ deploy + rolling
#   bash devops/swarm/rebuild-deploy-staging.sh api-gateway user-service  # build subset rồi deploy all
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

STACK_NAME="${STACK_NAME:-voicehub}"
SKIP_BUILD=0
BUILD_ARGS=()

for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
    *) BUILD_ARGS+=("$arg") ;;
  esac
done

if ! docker info >/dev/null 2>&1; then
  echo "[FAIL] Docker daemon không phản hồi — mở/restart Docker Desktop rồi chạy lại." >&2
  exit 1
fi

if ! docker node ls >/dev/null 2>&1; then
  echo "[FAIL] Node này không phải Swarm manager — chạy trên máy đã docker swarm init." >&2
  exit 1
fi

echo "==> Security env (staging)"
VOICEHUB_ENV_CHECK=staging bash devops/scripts/check-security-env.sh

if [[ "$SKIP_BUILD" -eq 0 ]]; then
  echo "==> Build images (voicehub-*:latest)"
  if [[ ${#BUILD_ARGS[@]} -gt 0 ]]; then
    bash devops/swarm/build-local-images.sh "${BUILD_ARGS[@]}"
  else
    bash devops/swarm/build-local-images.sh
  fi
else
  echo "==> Skip build (--skip-build)"
fi

echo "==> Deploy stack ${STACK_NAME}"
export SWARM_USE_LOCAL_IMAGES=1
bash devops/swarm/deploy-stack.sh

echo "==> Rolling force-update app services"
bash devops/swarm/rolling-update-phase1-env.sh

echo ""
echo "[OK] Staging Swarm deploy xong."
docker stack services "$STACK_NAME"
