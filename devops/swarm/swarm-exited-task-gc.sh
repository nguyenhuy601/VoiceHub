#!/usr/bin/env bash
# Tự xóa container Swarm task đã chết (Exited) — gần với "task mới lên thì task cũ biến mất".
#
# Swarm KHÔNG có flag built-in cho việc này; script lắng nghe docker events.
#
# Chạy nền trên máy Docker (manager / Docker Desktop):
#   bash devops/swarm/swarm-exited-task-gc.sh
#   nohup bash devops/swarm/swarm-exited-task-gc.sh >> backup/swarm-task-gc.log 2>&1 &
#
# Env:
#   SWARM_TASK_GC_GRACE_SEC=3   — đợi vài giây trước khi rm (để kịp docker logs)
#   SWARM_TASK_GC_DRY_RUN=1     — chỉ in log, không xóa
set -euo pipefail

GRACE_SEC="${SWARM_TASK_GC_GRACE_SEC:-3}"
DRY_RUN="${SWARM_TASK_GC_DRY_RUN:-0}"

if ! docker info >/dev/null 2>&1; then
  echo "[swarm-task-gc] Docker không sẵn sàng" >&2
  exit 1
fi

cleanup_exited_swarm_containers() {
  local ids
  ids="$(docker ps -aq \
    --filter "label=com.docker.swarm.service.name" \
    --filter "status=exited" 2>/dev/null || true)"
  [[ -z "$ids" ]] && return 0
  while read -r cid; do
    [[ -z "$cid" ]] && continue
    local svc
    svc="$(docker inspect -f '{{index .Config.Labels "com.docker.swarm.service.name"}}' "$cid" 2>/dev/null || true)"
    if [[ "$DRY_RUN" == "1" ]]; then
      echo "[swarm-task-gc] dry-run would remove ${cid} (${svc})"
      continue
    fi
    if docker rm -f "$cid" >/dev/null 2>&1; then
      echo "[swarm-task-gc] removed exited ${cid} (${svc})"
    fi
  done <<< "$ids"
}

remove_if_swarm_task_exited() {
  local cid="$1"
  [[ -z "$cid" ]] && return 0

  local svc
  svc="$(docker inspect -f '{{index .Config.Labels "com.docker.swarm.service.name"}}' "$cid" 2>/dev/null || true)"
  [[ -z "$svc" ]] && return 0

  if [[ "$GRACE_SEC" -gt 0 ]]; then
    sleep "$GRACE_SEC"
  fi

  local state
  state="$(docker inspect -f '{{.State.Status}}' "$cid" 2>/dev/null || true)"
  [[ "$state" != "exited" && "$state" != "dead" ]] && return 0

  if [[ "$DRY_RUN" == "1" ]]; then
    echo "[swarm-task-gc] dry-run would remove ${cid} (${svc})"
    return 0
  fi

  if docker rm -f "$cid" >/dev/null 2>&1; then
    echo "[swarm-task-gc] removed ${cid} (${svc})"
  fi
}

echo "[swarm-task-gc] started (grace=${GRACE_SEC}s, dry_run=${DRY_RUN})"
cleanup_exited_swarm_containers

# die = container process ended; oom = OOM killed
docker events \
  --filter 'type=container' \
  --filter 'event=die' \
  --filter 'event=oom' \
  --format '{{.ID}}' | while read -r cid; do
  remove_if_swarm_task_exited "$cid" || true
done
