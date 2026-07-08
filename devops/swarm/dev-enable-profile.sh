#!/usr/bin/env bash
# Bật profile dev đầy đủ trên Docker Desktop (~9.5GB VM):
# - Deploy / refresh stack app (docker-stack.yml)
# - Scale Swarm ollama + paddleocr về 0 (chạy bản Compose extra thay thế)
# - Compose extra: ollama, paddleocr, minio, meilisearch, voice-recording-worker
#
# Usage:
#   bash devops/swarm/dev-enable-profile.sh
#   bash devops/swarm/dev-enable-profile.sh --skip-deploy   # chỉ scale + compose
#   bash devops/swarm/dev-enable-profile.sh --ai-only       # chỉ ollama + paddle (compose)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
STACK="${STACK_NAME:-voicehub}"
COMPOSE_EXTRA=(docker compose -f docker-compose.swarm-extra.yml --env-file .env)
SKIP_DEPLOY=0
AI_ONLY=0

for arg in "$@"; do
  case "$arg" in
    --skip-deploy) SKIP_DEPLOY=1 ;;
    --ai-only) AI_ONLY=1 ;;
  esac
done

if ! docker info >/dev/null 2>&1; then
  echo "[FAIL] Docker daemon không phản hồi — mở Docker Desktop rồi chạy lại." >&2
  exit 1
fi

NODE_ID="$(docker node ls -q 2>/dev/null | head -1 || true)"
if [[ -n "$NODE_ID" ]]; then
  echo "[1/6] Gắn label node (ai, voice) nếu thiếu..."
  docker node update --label-add ai=true "$NODE_ID" 2>/dev/null || true
  docker node update --label-add voice=true "$NODE_ID" 2>/dev/null || true
fi

if [[ "$SKIP_DEPLOY" != "1" ]]; then
  echo "[2/6] Deploy stack app (ollama/paddle vẫn trong file nhưng sẽ scale 0)..."
  SWARM_USE_LOCAL_IMAGES="${SWARM_USE_LOCAL_IMAGES:-1}" \
    STACK_FILE="${STACK_FILE:-docker-stack.yml}" \
    bash "$ROOT/devops/swarm/deploy-stack.sh"
else
  echo "[2/6] Bỏ qua deploy (--skip-deploy)"
fi

echo "[3/6] Tắt ollama + paddleocr trên Swarm (dùng Compose extra, tránh trùng DNS)..."
docker service scale "${STACK}_ollama=0" "${STACK}_paddleocr-service=0" 2>/dev/null || true

NET="${ENTERPRISE_NETWORK_NAME:-voicehub_enterprise-network}"
if ! docker network inspect "$NET" >/dev/null 2>&1; then
  echo "[WARN] Overlay $NET chưa tồn tại — chạy deploy stack trước." >&2
fi

if [[ "$AI_ONLY" == "1" ]]; then
  echo "[4/6] Compose extra — chỉ AI (ollama + paddleocr)..."
  "${COMPOSE_EXTRA[@]}" up -d ollama paddleocr-service
else
  echo "[4/6] Compose extra (ollama, paddleocr, minio, meilisearch, voice-recording-worker)..."
  "${COMPOSE_EXTRA[@]}" up -d --build
fi

echo "[5/6] Pull model Ollama (Compose extra)..."
OLLAMA_CID="$("${COMPOSE_EXTRA[@]}" ps -q ollama 2>/dev/null | head -1 || true)"
if [[ -z "$OLLAMA_CID" ]]; then
  OLLAMA_CID="$(docker ps -q -f "name=voicehub-extra-ollama" | head -1 || true)"
fi
if [[ -n "$OLLAMA_CID" ]]; then
  MODEL="${OLLAMA_MODEL:-qwen2.5:3b-instruct}"
  echo "  container=$OLLAMA_CID model=$MODEL"
  docker exec "$OLLAMA_CID" ollama pull "$MODEL" || echo "[WARN] ollama pull thất bại — thử lại sau khi ollama healthy"
else
  echo "[WARN] Chưa thấy container ollama extra — kiểm tra: docker compose -f docker-compose.swarm-extra.yml ps"
fi

echo ""
echo "=== Swarm replicas (ollama/paddle nên 0/0) ==="
docker service ls --filter "name=${STACK}_" --format "{{.Name}} {{.Replicas}}" 2>/dev/null | sort
echo ""
echo "=== Compose extra ==="
"${COMPOSE_EXTRA[@]}" ps 2>/dev/null || true
echo ""
echo "=== Container memory (top) ==="
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}" 2>/dev/null | head -45
echo ""
echo "[OK] Profile dev đã bật."
echo "  Ollama/Paddle: Compose voicehub-extra (không dùng Swarm ${STACK}_ollama)."
echo "  Tắt OCR khi thiếu RAM: docker compose -f docker-compose.swarm-extra.yml stop paddleocr-service"
echo "  Bật lại Swarm AI (không khuyến nghị dev): docker service scale ${STACK}_ollama=1 && compose stop ollama"
