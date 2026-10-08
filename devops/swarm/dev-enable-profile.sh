#!/usr/bin/env bash
# Bật profile dev đầy đủ trên Docker Desktop (~9.5GB VM):
# - Deploy / refresh stack app (docker-stack.yml) — không gồm ollama
# - Gỡ leftover Swarm ollama + paddleocr (nếu còn từ stack cũ)
# - Compose extra: ollama, minio, meilisearch, qdrant
#
# Usage:
#   bash devops/swarm/dev-enable-profile.sh
#   bash devops/swarm/dev-enable-profile.sh --skip-deploy   # chỉ gỡ leftover + compose
#   bash devops/swarm/dev-enable-profile.sh --ai-only       # chỉ ollama (compose)
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
  echo "[2/6] Deploy stack app (ollama chỉ chạy Compose extra)..."
  SWARM_USE_LOCAL_IMAGES="${SWARM_USE_LOCAL_IMAGES:-1}" \
    STACK_FILE="${STACK_FILE:-docker-stack.yml}" \
    bash "$ROOT/devops/swarm/deploy-stack.sh"
else
  echo "[2/6] Bỏ qua deploy (--skip-deploy)"
fi

echo "[3/6] Gỡ leftover Swarm ollama + paddleocr (nếu còn từ stack cũ)..."
docker service rm "${STACK}_ollama" "${STACK}_paddleocr-service" 2>/dev/null || true

NET="${ENTERPRISE_NETWORK_NAME:-voicehub_enterprise-network}"
if ! docker network inspect "$NET" >/dev/null 2>&1; then
  echo "[WARN] Overlay $NET chưa tồn tại — chạy deploy stack trước." >&2
fi

if [[ "$AI_ONLY" == "1" ]]; then
  echo "[4/6] Compose extra — chỉ AI (ollama)..."
  "${COMPOSE_EXTRA[@]}" up -d ollama
else
  echo "[4/6] Compose extra (ollama, minio, meilisearch, qdrant)..."
  "${COMPOSE_EXTRA[@]}" up -d --build
fi

echo "[5/6] Pull model Ollama (Compose extra)..."
OLLAMA_CID="$("${COMPOSE_EXTRA[@]}" ps -q ollama 2>/dev/null | head -1 || true)"
if [[ -z "$OLLAMA_CID" ]]; then
  OLLAMA_CID="$(docker ps -q -f "name=voicehub-extra-ollama" | head -1 || true)"
fi
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
  echo "[WARN] Chưa thấy container ollama extra — kiểm tra: docker compose -f docker-compose.swarm-extra.yml ps"
fi

echo ""
echo "=== Swarm replicas ==="
docker service ls --filter "name=${STACK}_" --format "{{.Name}} {{.Replicas}}" 2>/dev/null | sort
echo ""
echo "=== Compose extra ==="
"${COMPOSE_EXTRA[@]}" ps 2>/dev/null || true
echo ""
echo "=== Container memory (top) ==="
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}" 2>/dev/null | head -45
echo ""
echo "[OK] Profile dev đã bật."
echo "  Ollama: Compose voicehub-extra (không nằm trong Swarm)."
