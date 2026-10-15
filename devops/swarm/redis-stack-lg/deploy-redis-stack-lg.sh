#!/usr/bin/env bash
# Bật / tắt Redis Stack riêng cho LangGraph checkpointer (RedisJSON).
#
# Usage:
#   bash devops/swarm/redis-stack-lg/deploy-redis-stack-lg.sh           # up + gợi ý env
#   bash devops/swarm/redis-stack-lg/deploy-redis-stack-lg.sh --down    # gỡ stack
#   bash devops/swarm/redis-stack-lg/deploy-redis-stack-lg.sh --status  # kiểm tra JSON.SET
#   bash devops/swarm/redis-stack-lg/deploy-redis-stack-lg.sh --wire    # up + update AI planning env
#
set -euo pipefail

# script → redis-stack-lg → swarm → devops → repo root (giống redis-sentinel)
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

STACK_NAME="${REDIS_STACK_LG_STACK_NAME:-voicehub-redis-lg}"
COMPOSE_FILE="$ROOT/devops/swarm/redis-stack-lg/docker-compose.redis-stack-lg.yml"
ENTERPRISE_NET="${ENTERPRISE_NETWORK_NAME:-voicehub_enterprise-network}"
APP_STACK="${STACK_NAME_APP:-voicehub}"
AI_SVC="${APP_STACK}_ai-project-planning-service"
LG_URL_DEFAULT="redis://redis-lg:6379"

MODE=up
for arg in "$@"; do
  case "$arg" in
    --down) MODE=down ;;
    --status) MODE=status ;;
    --wire) MODE=wire ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
  esac
done

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source <(sed $'s/\r$//' "$ROOT/.env" | sed $'1s/^\xEF\xBB\xBF//')
  set +a
fi

if ! docker info >/dev/null 2>&1; then
  echo "[FAIL] Docker daemon không phản hồi." >&2
  exit 1
fi

ensure_network() {
  if ! docker network inspect "$ENTERPRISE_NET" >/dev/null 2>&1; then
    echo "[FAIL] Overlay $ENTERPRISE_NET chưa có — deploy app stack trước:" >&2
    echo "  bash devops/swarm/deploy-stack.sh" >&2
    exit 1
  fi
}

probe_json() {
  local cid
  cid="$(docker ps -q -f "name=${STACK_NAME}_redis-lg" 2>/dev/null | head -1 || true)"
  if [[ -z "$cid" ]]; then
    echo "[FAIL] Container ${STACK_NAME}_redis-lg chưa chạy."
    return 1
  fi
  local out
  out="$(docker exec "$cid" redis-cli JSON.SET __vh_lg_probe '$' '"ok"' 2>&1 || true)"
  docker exec "$cid" redis-cli JSON.DEL __vh_lg_probe >/dev/null 2>&1 || true
  if echo "$out" | grep -qi 'unknown command\|ERR'; then
    echo "[FAIL] RedisJSON chưa sẵn: $out"
    return 1
  fi
  echo "[OK] RedisJSON JSON.SET trên redis-lg"
  return 0
}

print_env_hint() {
  cat <<EOF

[Env gợi ý — root .env + service AI]

  LG_REDIS_URL=${LG_URL_DEFAULT}
  AGENT_CORE_LG_MEMORY=0
  AGENT_CORE_HITL_INTERRUPT=1   # chỉ khi đã probe RedisJSON OK

Giữ REDIS_HOST/REDIS_PASSWORD cho app (alpine/Sentinel) — không đổi.

Wire nhanh (không sửa file .env):
  bash devops/swarm/redis-stack-lg/deploy-redis-stack-lg.sh --wire

EOF
}

wire_ai_service() {
  if ! docker service inspect "$AI_SVC" >/dev/null 2>&1; then
    echo "[WARN] Service $AI_SVC chưa có — bỏ qua --wire env. Deploy app stack trước."
    return 0
  fi
  echo "[wire] Update $AI_SVC → LG_REDIS_URL + HITL interrupt policy..."
  # Force HITL on when wiring Stack (ignore stale AGENT_CORE_HITL_INTERRUPT=0 in .env)
  docker service update \
    --env-add "LG_REDIS_URL=${LG_URL_DEFAULT}" \
    --env-add "AGENT_CORE_LG_MEMORY=0" \
    --env-add "AGENT_CORE_HITL_INTERRUPT=1" \
    --update-parallelism 1 \
    --update-order start-first \
    "$AI_SVC"
  echo "[OK] Wired. Kiểm tra: docker service logs --tail 30 $AI_SVC"
}

case "$MODE" in
  down)
    echo "[down] Remove stack $STACK_NAME..."
    docker stack rm "$STACK_NAME" 2>/dev/null || true
    echo "[OK] Đã gỡ (volume redis_lg_data có thể còn — xóa tay nếu muốn thu dung lượng)."
    echo "  docker volume ls | grep redis_lg"
    ;;
  status)
    docker stack services "$STACK_NAME" 2>/dev/null || echo "(stack chưa deploy)"
    probe_json || true
    ;;
  up|wire)
    ensure_network
    echo "[pull] ${REDIS_STACK_LG_IMAGE:-redis/redis-stack-server:7.4.0-v1}"
    docker pull "${REDIS_STACK_LG_IMAGE:-redis/redis-stack-server:7.4.0-v1}"
    echo "[deploy] stack $STACK_NAME ..."
    docker stack deploy -c "$COMPOSE_FILE" "$STACK_NAME"
    echo "[wait] redis-lg ready..."
    ok=0
    for _ in $(seq 1 40); do
      if probe_json >/dev/null 2>&1; then
        ok=1
        break
      fi
      sleep 2
    done
    if [[ "$ok" != "1" ]]; then
      echo "[FAIL] Timeout chờ RedisJSON trên redis-lg." >&2
      docker service ps "${STACK_NAME}_redis-lg" || true
      exit 1
    fi
    probe_json
    print_env_hint
    if [[ "$MODE" == "wire" ]]; then
      wire_ai_service
    fi
    ;;
esac
