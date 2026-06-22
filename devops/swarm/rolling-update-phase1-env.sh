#!/usr/bin/env bash
# P1-Cutover — force rolling recreate sau khi đổi .env (Redis Sentinel / Rabbit cluster / Atlas)
# bash devops/swarm/rolling-update-phase1-env.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

STACK_NAME="${STACK_NAME:-voicehub}"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

# shellcheck disable=SC1091
source "$ROOT/devops/swarm/resolve-swarm-images.sh"
resolve_swarm_images

# Redeploy compose trước (env interpolation + env_file paths)
echo "Redeploy stack to apply compose env..."
docker stack deploy -c docker-stack.yml "$STACK_NAME" --with-registry-auth

APP_SERVICES=(
  api-gateway
  auth-service
  user-service
  organization-service
  friend-service
  role-permission-service
  chat-service
  task-service
  task-worker
  ai-task-service
  ai-task-worker
  ai-task-extract-worker
  ai-task-sync-worker
  document-service
  voice-service
  notification-service
  notification-dispatch-worker
  webhook-service
  webhook-delivery-worker
  socket-service
)

echo "Rolling force-update app services..."
for svc in "${APP_SERVICES[@]}"; do
  full="${STACK_NAME}_${svc}"
  if docker service inspect "$full" >/dev/null 2>&1; then
    echo "  -> $full"
    docker service update \
      --force \
      --update-parallelism 1 \
      --update-order start-first \
      "$full"
  else
    echo "  [skip] $full (not deployed)"
  fi
done

echo ""
echo "[OK] Rolling update complete"
docker stack services "$STACK_NAME"
