#!/usr/bin/env bash
# Build Swarm images với @enterprise/shared baked in (context = repo root).
# Usage: bash devops/swarm/build-local-images.sh [service-name ...]
#   bash devops/swarm/build-local-images.sh              # all app images
#   bash devops/swarm/build-local-images.sh auth-service # one service
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

TAG="${TAG:-latest}"

declare -a ALL_IMAGES=(
  "api-gateway:api-gateway/Dockerfile"
  "auth-service:services/auth-service/Dockerfile"
  "user-service:services/user-service/Dockerfile"
  "organization-service:services/organization-service/Dockerfile"
  "friend-service:services/friend-service/Dockerfile"
  "role-permission-service:services/role-permission-service/Dockerfile"
  "chat-service:services/chat-service/Dockerfile"
  "task-service:services/task-service/Dockerfile"
  "ai-task-service:services/ai-task-service/Dockerfile"
  "ai-task-worker:services/ai-task-worker/Dockerfile"
  "summary-service:services/summary-service/Dockerfile"
  "summary-worker:services/summary-worker/Dockerfile"
  "document-service:services/document-service/Dockerfile"
  "voice-service:services/voice-service/Dockerfile"
  "notification-service:services/notification-service/Dockerfile"
  "webhook-service:services/webhook-service/Dockerfile"
  "socket-service:services/socket-service/Dockerfile"
)

build_one() {
  local name="$1"
  local dockerfile="$2"
  local local_tag="voicehub-${name}:${TAG}"

  echo "==> Building ${local_tag} (${dockerfile})"
  if [[ "$dockerfile" == services/webhook-service/Dockerfile ]]; then
    docker build -f "${ROOT}/${dockerfile}" -t "${local_tag}" "${ROOT}/services/webhook-service"
  else
    docker build -f "${ROOT}/${dockerfile}" -t "${local_tag}" "${ROOT}"
  fi

  if [[ "${BUILD_TAG_REGISTRY:-0}" == "1" && -n "${REGISTRY:-}" && -n "${OWNER:-}" ]]; then
    local remote="${REGISTRY}/${OWNER}/voicehub/${name}:${TAG}"
    docker tag "${local_tag}" "${remote}"
    echo "    tagged ${remote} (BUILD_TAG_REGISTRY=1)"
  fi
}

if [[ $# -gt 0 ]]; then
  for want in "$@"; do
    found=0
    for item in "${ALL_IMAGES[@]}"; do
      name="${item%%:*}"
      dockerfile="${item#*:}"
      if [[ "$name" == "$want" ]]; then
        build_one "$name" "$dockerfile"
        found=1
        break
      fi
    done
    if [[ "$found" -eq 0 ]]; then
      echo "[FAIL] Unknown service: $want" >&2
      exit 1
    fi
  done
else
  for item in "${ALL_IMAGES[@]}"; do
    build_one "${item%%:*}" "${item#*:}"
  done
fi

echo ""
echo "[OK] Local images ready (voicehub-*:${TAG})"
echo "Deploy: SWARM_USE_LOCAL_IMAGES=1 bash devops/swarm/deploy-stack.sh"
echo "Tip: ghcr.io/* trùng Image ID là do tag kép — xóa tag registry (giữ voicehub-*):"
echo "  docker rmi ghcr.io/${OWNER:-OWNER}/voicehub/<service>:${TAG}"
