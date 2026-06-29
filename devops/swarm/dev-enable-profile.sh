#!/usr/bin/env bash
# Bật profile dev đầy đủ trên Docker Desktop (~9.5GB VM):
# - Hạ limit ollama/voice trong docker-stack.yml (deploy lại)
# - Scale ollama + paddleocr
# - Compose: minio, meilisearch, voice-recording-worker trên overlay Swarm
#
# Usage:
#   bash devops/swarm/dev-enable-profile.sh
#   bash devops/swarm/dev-enable-profile.sh --skip-deploy   # chỉ scale + compose
#   bash devops/swarm/dev-enable-profile.sh --ai-only       # chỉ ollama
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
STACK="${STACK_NAME:-voicehub}"
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
  echo "[1/5] Gắn label node (ai, voice) nếu thiếu..."
  docker node update --label-add ai=true "$NODE_ID" 2>/dev/null || true
  docker node update --label-add voice=true "$NODE_ID" 2>/dev/null || true
fi

if [[ "$SKIP_DEPLOY" != "1" ]]; then
  echo "[2/5] Deploy stack (limit RAM đã hạ: ollama 3G, voice 384M)..."
  SWARM_USE_LOCAL_IMAGES="${SWARM_USE_LOCAL_IMAGES:-1}" \
    STACK_FILE="${STACK_FILE:-docker-stack.yml}" \
    bash "$ROOT/devops/swarm/deploy-stack.sh"
else
  echo "[2/5] Bỏ qua deploy (--skip-deploy)"
fi

echo "[3/5] Scale ollama=1..."
docker service scale "${STACK}_ollama=1"

if [[ "$AI_ONLY" != "1" ]]; then
  echo "[3b/5] Scale paddleocr=1 (tắt nếu thiếu RAM: docker service scale ${STACK}_paddleocr-service=0)..."
  docker service scale "${STACK}_paddleocr-service=1" || true

  echo "[4/5] Compose infra extra (minio, meilisearch, voice-recording-worker)..."
  docker compose -f docker-compose.swarm-extra.yml --env-file .env up -d --build

  NET="${ENTERPRISE_NETWORK_NAME:-voicehub_enterprise-network}"
  if ! docker network inspect "$NET" >/dev/null 2>&1; then
    echo "[WARN] Overlay $NET chưa tồn tại — stack Swarm chưa deploy?" >&2
  fi
else
  echo "[4/5] Bỏ qua compose extra (--ai-only)"
fi

echo "[5/5] Pull model Ollama (nếu container đã chạy)..."
OLLAMA_CID="$(docker ps -q -f "name=${STACK}_ollama" | head -1 || true)"
if [[ -n "$OLLAMA_CID" ]]; then
  MODEL="${OLLAMA_MODEL:-qwen2.5:3b-instruct}"
  docker exec "$OLLAMA_CID" ollama pull "$MODEL" || echo "[WARN] ollama pull thất bại — thử lại sau khi ollama healthy"
else
  echo "[WARN] Chưa thấy container ollama — kiểm tra: docker service ps ${STACK}_ollama"
fi

echo ""
echo "=== Service replicas ==="
docker service ls --filter "name=${STACK}_" --format "{{.Name}} {{.Replicas}}" 2>/dev/null | sort
echo ""
echo "=== Container memory ==="
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}" 2>/dev/null | head -40
echo ""
echo "[OK] Profile dev đã bật. PaddleOCR tốn RAM — scale 0 khi không test OCR:"
echo "  docker service scale ${STACK}_paddleocr-service=0"
