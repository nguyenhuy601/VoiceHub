#!/usr/bin/env bash
# Nguồn sau khi load .env — set biến *_IMAGE cho docker stack deploy
# Local (REGISTRY/OWNER trống): voicehub-<service>:${TAG}
# Registry: ${REGISTRY}/${OWNER}/voicehub/<service>:${TAG}
# Release manifest (VOICEHUB_RELEASE_MANIFEST): pin digest @sha256 (SoT for STG/PROD)

resolve_swarm_images() {
  TAG="${TAG:-latest}"

  if [[ -n "${VOICEHUB_RELEASE_MANIFEST:-}" && -f "${VOICEHUB_RELEASE_MANIFEST}" ]]; then
    # Export *_IMAGE from manifest digests via Node (portable)
    eval "$(
      MANIFEST_PATH="${VOICEHUB_RELEASE_MANIFEST}" node <<'NODE'
const fs = require('fs');
const m = JSON.parse(fs.readFileSync(process.env.MANIFEST_PATH, 'utf8'));
const map = {
  'api-gateway': 'API_GATEWAY_IMAGE',
  'auth-service': 'AUTH_SERVICE_IMAGE',
  'user-service': 'USER_SERVICE_IMAGE',
  'organization-service': 'ORGANIZATION_SERVICE_IMAGE',
  'friend-service': 'FRIEND_SERVICE_IMAGE',
  'role-permission-service': 'ROLE_PERMISSION_SERVICE_IMAGE',
  'chat-service': 'CHAT_SERVICE_IMAGE',
  'project-service': 'PROJECT_SERVICE_IMAGE',
  'ai-task-service': 'AI_TASK_SERVICE_IMAGE',
  'ai-task-worker': 'AI_TASK_WORKER_IMAGE',
  'ai-project-planning-service': 'AI_PROJECT_PLANNING_SERVICE_IMAGE',
  'summary-service': 'SUMMARY_SERVICE_IMAGE',
  'summary-worker': 'SUMMARY_WORKER_IMAGE',
  'document-service': 'DOCUMENT_SERVICE_IMAGE',
  'voice-service': 'VOICE_SERVICE_IMAGE',
  'notification-service': 'NOTIFICATION_SERVICE_IMAGE',
  'socket-service': 'SOCKET_SERVICE_IMAGE',
};
for (const [svc, envName] of Object.entries(map)) {
  const dig = m.services?.[svc]?.digest;
  if (!dig) {
    console.error(`Missing digest for ${svc}`);
    process.exit(1);
  }
  // shell-safe single-quoted export
  const safe = String(dig).replace(/'/g, `'\"'\"'`);
  console.log(`export ${envName}='${safe}'`);
}
console.error(`[INFO] Swarm images: release ${m.releaseId} @ ${m.commit} (digest pin)`);
NODE
    )"
    return 0
  fi

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
  export AI_TASK_SERVICE_IMAGE="$(_swarm_image ai-task-service)"
  export AI_TASK_WORKER_IMAGE="$(_swarm_image ai-task-worker)"
  export AI_PROJECT_PLANNING_SERVICE_IMAGE="$(_swarm_image ai-project-planning-service)"
  export SUMMARY_SERVICE_IMAGE="$(_swarm_image summary-service)"
  export SUMMARY_WORKER_IMAGE="$(_swarm_image summary-worker)"
  export DOCUMENT_SERVICE_IMAGE="$(_swarm_image document-service)"
  export VOICE_SERVICE_IMAGE="$(_swarm_image voice-service)"
  export NOTIFICATION_SERVICE_IMAGE="$(_swarm_image notification-service)"
  export SOCKET_SERVICE_IMAGE="$(_swarm_image socket-service)"

  if [[ -n "${REGISTRY:-}" && -n "${OWNER:-}" ]]; then
    echo "[INFO] Swarm images: ${REGISTRY}/${OWNER}/voicehub/*:${TAG}"
  else
    echo "[INFO] Swarm images: local voicehub-*:${TAG} (set REGISTRY+OWNER for ghcr/docker hub)"
  fi
}
