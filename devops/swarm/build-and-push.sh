#!/usr/bin/env bash
set -euo pipefail

# Build/push Swarm images — context repo root để link @enterprise/shared.
# Requires docker login to your registry first.

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

REGISTRY="${REGISTRY:?Set REGISTRY in .env}"
OWNER="${OWNER:?Set OWNER in .env}"
TAG="${TAG:-latest}"

declare -a IMAGES=(
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

for item in "${IMAGES[@]}"; do
  name="${item%%:*}"
  dockerfile="${item#*:}"
  full="${REGISTRY}/${OWNER}/voicehub/${name}:${TAG}"
  latest="${REGISTRY}/${OWNER}/voicehub/${name}:latest"
  local_tag="voicehub-${name}:${TAG}"

  echo "Building ${name} from ${dockerfile}"
  if [[ "$dockerfile" == services/webhook-service/Dockerfile ]]; then
    docker build -f "${ROOT_DIR}/${dockerfile}" -t "${full}" -t "${latest}" -t "${local_tag}" \
      "${ROOT_DIR}/services/webhook-service"
  else
    docker build -f "${ROOT_DIR}/${dockerfile}" -t "${full}" -t "${latest}" -t "${local_tag}" \
      "${ROOT_DIR}"
  fi
  docker push "${full}"
  docker push "${latest}"
done

echo "Done. Deploy: bash devops/swarm/deploy-stack.sh"
