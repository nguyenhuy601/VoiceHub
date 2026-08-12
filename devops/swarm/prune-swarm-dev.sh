#!/usr/bin/env bash
# Dọn container/image build cũ trên Docker Desktop (Swarm dev) — giải phóng RAM/disk
# Usage: bash devops/swarm/prune-swarm-dev.sh
# Không xóa volumes có label stack (redis/rabbit data).
set -euo pipefail

echo "=== Trước dọn ==="
docker ps -a --format '{{.Status}}' 2>/dev/null | sort | uniq -c | sort -rn || true
docker ps -q 2>/dev/null | wc -l | xargs -I{} echo "Running containers: {}"
docker images voicehub-* -q 2>/dev/null | wc -l | xargs -I{} echo "voicehub images: {}"

echo ""
echo "=== Scale tạm service nặng / worker (dev) ==="
docker service scale \
  voicehub_ollama=0 \
  voicehub_paddleocr-service=0 \
  voicehub_notification-dispatch-worker=0 \
  voicehub_project-worker=0 \
  voicehub_ai-task-extract-worker=0 \
  voicehub_ai-task-sync-worker=0 \
  2>/dev/null || true
sleep 5

echo ""
echo "=== Xóa container đã dừng (trước rollback) ==="
docker container prune -f

echo ""
echo "=== Hủy update Swarm đang kẹt (chỉ service đang updating) ==="
for svc in api-gateway auth-service chat-service socket-service project-worker notification-dispatch-worker; do
  state="$(docker service inspect "voicehub_${svc}" --format '{{.UpdateStatus.State}}' 2>/dev/null || true)"
  if [[ "$state" == "updating" ]]; then
    echo "  rollback voicehub_${svc}"
    docker service update --rollback "voicehub_${svc}" --detach=true 2>/dev/null || true
  fi
done

echo ""
echo "=== Xóa image dangling + build cache ==="
docker image prune -f
docker builder prune -f --filter until=24h 2>/dev/null || docker builder prune -f

echo ""
echo "=== Xóa image voicehub trùng (giữ :latest) ==="
docker images voicehub-* -q 2>/dev/null | sort -u | while read -r id; do
  [[ -z "$id" ]] && continue
  refs="$(docker inspect "$id" --format '{{join .RepoTags ","}}' 2>/dev/null || true)"
  case "$refs" in
    *:latest*) ;;
    voicehub-*|*voicehub/*) docker rmi "$id" 2>/dev/null || true ;;
  esac
done

echo ""
echo "=== Gỡ tag ghcr trùng Image ID (giữ voicehub-*) ==="
if [[ -n "${OWNER:-}" ]]; then
  prefix="ghcr.io/${OWNER}/voicehub/"
  docker images --format '{{.Repository}}:{{.Tag}} {{.ID}}' 2>/dev/null | grep "^${prefix}" | while read -r ref id; do
    local_name=""
    svc="${ref#${prefix}}"
    svc="${svc%%:*}"
    local_name="voicehub-${svc//\//-}:latest"
    if docker images --format '{{.Repository}}:{{.Tag}} {{.ID}}' 2>/dev/null | grep -q "^voicehub-${svc}:.* ${id}$"; then
      echo "  rmi tag $ref (same ID as voicehub-${svc})"
      docker rmi "$ref" 2>/dev/null || true
    fi
  done
fi

echo ""
echo "=== Sau dọn ==="
docker ps -a --format '{{.Status}}' 2>/dev/null | sort | uniq -c | sort -rn || true
docker ps -q 2>/dev/null | wc -l | xargs -I{} echo "Running containers: {}"
echo ""
echo "[OK] Prune xong. Nếu vẫn 'insufficient resources': restart Docker Desktop, rồi:"
echo "  SWARM_USE_LOCAL_IMAGES=1 bash devops/swarm/rolling-update-phase1-env.sh"
