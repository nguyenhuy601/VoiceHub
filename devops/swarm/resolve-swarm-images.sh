#!/usr/bin/env bash
# Nguồn sau khi load .env — set biến *_IMAGE cho docker stack deploy
# Local (REGISTRY/OWNER trống): voicehub-<service>:${TAG}
# Registry: ${REGISTRY}/${OWNER}/voicehub/<service>:${TAG}

resolve_swarm_images() {
  TAG="${TAG:-latest}"

  _swarm_image() {
    local name="$1"
    if [[ "${SWARM_USE_LOCAL_IMAGES:-}" == "1" ]] || [[ -z "${REGISTRY:-}" ]] || [[ -z "${OWNER:-}" ]]; then
      echo "voicehub-${name}:${TAG}"
    elif [[ -n "${REGISTRY:-}" && -n "${OWNER:-}" ]]; then
      echo "${REGISTRY}/${OWNER}/voicehub/${name}:${TAG}"
    else
      echo "voicehub-${name}:${TAG}"
    fi
  }

  export API_GATEWAY_IMAGE="$(_swarm_image api-gateway)"
  export AUTH_SERVICE_IMAGE="$(_swarm_image auth-service)"
  export USER_SERVICE_IMAGE="$(_swarm_image user-service)"
  export ORGANIZATION_SERVICE_IMAGE="$(_swarm_image organization-service)"
  export FRIEND_SERVICE_IMAGE="$(_swarm_image friend-service)"
  export ROLE_PERMISSION_SERVICE_IMAGE="$(_swarm_image role-permission-service)"
  export CHAT_SERVICE_IMAGE="$(_swarm_image chat-service)"
  export PROJECT_SERVICE_IMAGE="$(_swarm_image project-service)"
  # Backward-compat alias while migrating stack files:
  export TASK_SERVICE_IMAGE="$(_swarm_image project-service)"
  export AI_TASK_SERVICE_IMAGE="$(_swarm_image ai-task-service)"
  export AI_TASK_WORKER_IMAGE="$(_swarm_image ai-task-worker)"
  export SUMMARY_SERVICE_IMAGE="$(_swarm_image summary-service)"
  export SUMMARY_WORKER_IMAGE="$(_swarm_image summary-worker)"
  export DOCUMENT_SERVICE_IMAGE="$(_swarm_image document-service)"
  export VOICE_SERVICE_IMAGE="$(_swarm_image voice-service)"
  export NOTIFICATION_SERVICE_IMAGE="$(_swarm_image notification-service)"
  export WEBHOOK_SERVICE_IMAGE="$(_swarm_image webhook-service)"
  export SOCKET_SERVICE_IMAGE="$(_swarm_image socket-service)"

  if [[ -n "${REGISTRY:-}" && -n "${OWNER:-}" ]]; then
    echo "[INFO] Swarm images: ${REGISTRY}/${OWNER}/voicehub/*:${TAG}"
  else
    echo "[INFO] Swarm images: local voicehub-*:${TAG} (set REGISTRY+OWNER for ghcr/docker hub)"
  fi
}
