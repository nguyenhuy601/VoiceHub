#!/usr/bin/env bash
# Bật profile dev đầy đủ trên Docker Desktop:
# - Deploy / refresh stack app (docker-stack.yml) — gồm ollama, minio, qdrant, meilisearch
# - Gỡ leftover Compose extra (voicehub-extra) nếu còn
# - Pull model Ollama trên task Swarm
#
# Usage:
#   bash devops/swarm/dev-enable-profile.sh
#   bash devops/swarm/dev-enable-profile.sh --skip-deploy   # chỉ pull model + dọn leftover
#   bash devops/swarm/dev-enable-profile.sh --ai-only       # alias --skip-deploy (infra đã trong Swarm)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
STACK="${STACK_NAME:-voicehub}"
SKIP_DEPLOY=0

for arg in "$@"; do
  case "$arg" in
    --skip-deploy|--ai-only) SKIP_DEPLOY=1 ;;
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
  echo "[2/5] Deploy stack app (gồm ollama, minio, qdrant, meilisearch)..."
  SWARM_USE_LOCAL_IMAGES="${SWARM_USE_LOCAL_IMAGES:-1}" \
    STACK_FILE="${STACK_FILE:-docker-stack.yml}" \
    bash "$ROOT/devops/swarm/deploy-stack.sh"
else
  echo "[2/5] Bỏ qua deploy (--skip-deploy)"
fi

echo "[3/5] Gỡ leftover Compose extra (voicehub-extra) nếu còn..."
docker compose -f docker-compose.swarm-extra.yml --env-file .env down 2>/dev/null || true
# Legacy container names
docker rm -f $(docker ps -aq -f "name=voicehub-extra-" 2>/dev/null) 2>/dev/null || true

echo "[4/5] Pull model Ollama (Swarm service ${STACK}_ollama)..."
OLLAMA_CID=""
for _ in $(seq 1 30); do
  OLLAMA_CID="$(docker ps -q -f "name=${STACK}_ollama" 2>/dev/null | head -1 || true)"
  if [[ -n "$OLLAMA_CID" ]]; then
    break
  fi
  sleep 2
done
if [[ -n "$OLLAMA_CID" ]]; then
  # shellcheck disable=SC1091
  PROVIDER="$(grep -E '^LLM_PROVIDER=' .env 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '\r' | tr '[:upper:]' '[:lower:]')"
  EMBED_MODEL="${G7_EMBEDDING_MODEL:-qwen3-embedding:0.6b}"
  case "$PROVIDER" in
    openai|openai_compatible|dashscope)
      echo "  LLM_PROVIDER=$PROVIDER — skip pull chat (DashScope); embed local=$EMBED_MODEL"
      docker exec "$OLLAMA_CID" ollama pull "$EMBED_MODEL" || echo "[WARN] ollama pull embed thất bại — G7 hybrid cần model này"
      ;;
    *)
      MODEL="${OLLAMA_MODEL:-qwen2.5:3b-instruct}"
      echo "  container=$OLLAMA_CID chat=$MODEL embed=$EMBED_MODEL"
      docker exec "$OLLAMA_CID" ollama pull "$MODEL" || echo "[WARN] ollama pull chat thất bại — thử lại sau khi ollama healthy"
      docker exec "$OLLAMA_CID" ollama pull "$EMBED_MODEL" || echo "[WARN] ollama pull embed thất bại — G7 hybrid cần model này"
      ;;
  esac
else
  echo "[WARN] Chưa thấy task ${STACK}_ollama — kiểm tra: docker service ls | grep ollama"
  echo "  Đảm bảo node có label ai=true (bước 1)."
fi

echo ""
echo "=== Swarm replicas ==="
docker service ls --filter "name=${STACK}_" --format "{{.Name}} {{.Replicas}}" 2>/dev/null | sort
echo ""
echo "=== Infra AI (Swarm) ==="
for svc in ollama minio qdrant meilisearch minio-init; do
  docker service ls --filter "name=${STACK}_${svc}" --format "{{.Name}} {{.Replicas}} {{.Image}}" 2>/dev/null || true
done
echo ""
echo "=== Container memory (top) ==="
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}" 2>/dev/null | head -45
echo ""
echo "[OK] Profile dev đã bật — Ollama/MinIO/Qdrant/Meili chạy trên Swarm."
