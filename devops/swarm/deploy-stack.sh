#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

STACK_NAME="${STACK_NAME:-voicehub}"
STACK_FILE="${STACK_FILE:-docker-stack.yml}"
DEPLOY_HA_INFRA="${DEPLOY_HA_INFRA:-0}"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

# Swarm bỏ qua env_file — nạp .env service voice để ${VAR} trong docker-stack.yml có giá trị khi deploy.
# Git Bash trên Windows: không convert VOICE_SIGNAL_PATH (/voice-socket → C:/Program Files/Git/...).
export MSYS2_ENV_CONV_EXCL="${MSYS2_ENV_CONV_EXCL:-}:VOICE_SIGNAL_PATH"

source_env_file() {
  local env_path="$1"
  [[ -f "$env_path" ]] || return 0
  set -a
  # shellcheck disable=SC1090
  source <(sed $'s/\r$//' "$env_path" | sed $'1s/^\xEF\xBB\xBF//')
  set +a
}

source_env_file "$ROOT/services/voice-service/.env"
# Git Bash trên Windows convert /voice-socket → C:/Program Files/Git/voice-socket khi source .env
export VOICE_SIGNAL_PATH='/voice-socket'
export PORT="${PORT:-3005}"

# shellcheck disable=SC1091
source "$ROOT/devops/swarm/resolve-swarm-images.sh"
resolve_swarm_images

if [[ "${SKIP_SECURITY_ENV_CHECK:-}" != "1" ]]; then
  VOICEHUB_ENV_CHECK="${VOICEHUB_ENV_CHECK:-staging}" bash devops/scripts/check-security-env.sh
fi

ENTERPRISE_NET="${ENTERPRISE_NETWORK_NAME:-voicehub_enterprise-network}"
if docker network inspect "$ENTERPRISE_NET" >/dev/null 2>&1; then
  NET_DRIVER="$(docker network inspect "$ENTERPRISE_NET" --format '{{.Driver}}')"
  NET_SCOPE="$(docker network inspect "$ENTERPRISE_NET" --format '{{.Scope}}')"
  if [[ "$NET_DRIVER" != "overlay" ]] || [[ "$NET_SCOPE" != "swarm" ]]; then
    echo "[FAIL] Network $ENTERPRISE_NET exists as ${NET_DRIVER}/${NET_SCOPE} — Swarm needs overlay/swarm." >&2
    echo "Local Compose is likely still running. Stop it before cutover:" >&2
    echo "  docker compose -f docker-compose.core.yml -f docker-compose.infra.yml down" >&2
    echo "  docker network rm $ENTERPRISE_NET   # if the network remains" >&2
    exit 1
  fi
fi

echo "Deploying stack ${STACK_NAME} with ${STACK_FILE}"
docker stack deploy -c "${STACK_FILE}" "${STACK_NAME}" --with-registry-auth

if [[ "${DEPLOY_HA_INFRA}" == "1" ]]; then
  echo "Deploying HA infra stacks (Redis Sentinel + RabbitMQ cluster)..."
  bash devops/swarm/redis-sentinel/deploy-sentinel-stack.sh
  bash devops/swarm/rabbitmq-cluster/deploy-cluster-stack.sh
fi

echo "Waiting for rollout..."
sleep 5
docker stack services "${STACK_NAME}"

echo "Tasks:"
docker stack ps "${STACK_NAME}" --no-trunc

if [[ "${DEPLOY_HA_INFRA}" == "1" ]]; then
  echo ""
  echo "HA stacks:"
  docker stack services "${REDIS_SENTINEL_STACK_NAME:-voicehub-redis}" 2>/dev/null || true
  docker stack services "${RABBITMQ_CLUSTER_STACK_NAME:-voicehub-rabbit}" 2>/dev/null || true
fi
