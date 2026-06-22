#!/usr/bin/env bash
# P1-Redis-B — Chaos: Sentinel failover + ioredis reconnect + realtime HA checklist
# bash devops/swarm/redis-sentinel/run-redis-client-failover-chaos.sh
# CHAOS_DRY_RUN=1 — chỉ config smoke, không failover
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

SENTINEL_DIR="$ROOT/devops/swarm/redis-sentinel"
COMPOSE_PROJECT="${REDIS_SENTINEL_PROJECT:-voicehub-redis}"
NET="voicehub-redis-sentinel-local"
FAIL=0

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

if [[ -z "${REDIS_PASSWORD:-}" ]]; then
  echo "[FAIL] REDIS_PASSWORD required" >&2
  exit 1
fi

echo "=== P1-Redis-B static smoke ==="
node "$ROOT/tests/p1-redis-client-cutover.smoke.js"

echo ""
echo "=== Realtime HA checklist ==="
bash "$ROOT/devops/swarm/run-realtime-ha-checklist.sh" || FAIL=1

if [[ "${CHAOS_DRY_RUN:-0}" == "1" ]]; then
  echo "[SKIP] CHAOS_DRY_RUN=1 — no sentinel failover"
  exit "$FAIL"
fi

echo ""
echo "=== Start local Sentinel stack ==="
docker compose \
  -f "$SENTINEL_DIR/docker-compose.sentinel.yml" \
  -f "$SENTINEL_DIR/docker-compose.sentinel.local.yml" \
  -p "$COMPOSE_PROJECT" \
  up -d
sleep 18

export REDIS_SENTINELS="redis-sentinel-1:26379,redis-sentinel-2:26379,redis-sentinel-3:26379"
export REDIS_SENTINEL_NAME="${REDIS_SENTINEL_NAME:-mymaster}"
unset REDIS_HOST REDIS_PORT REDIS_URL

echo ""
echo "=== ioredis ping (before failover) ==="
MSYS_NO_PATHCONV=1 docker run --rm --network "$NET" \
  -v "$ROOT/shared:/app/shared:ro" \
  -e REDIS_SENTINELS -e REDIS_SENTINEL_NAME -e REDIS_PASSWORD \
  -w /app node:20-alpine sh -c '
    npm install ioredis --no-save --prefix /tmp/r >/dev/null 2>&1
    node -e "
      const Redis = require(\"/tmp/r/node_modules/ioredis\");
      const { buildIoredisOptions } = require(\"./shared/config/redisConnection\");
      const o = buildIoredisOptions();
      const { connectionUrl, ...rest } = o;
      const c = connectionUrl ? new Redis(connectionUrl, rest) : new Redis(rest);
      c.ping().then(r => { console.log(\"PING\", r); return c.quit(); }).catch(e => { console.error(e); process.exit(1); });
    "
  ' || FAIL=1

echo ""
echo "=== SENTINEL failover ==="
MSYS_NO_PATHCONV=1 docker run --rm --network "$NET" redis:7-alpine \
  redis-cli -h redis-sentinel-1 -p 26379 SENTINEL failover "${REDIS_SENTINEL_NAME}" || true
sleep 12

echo ""
echo "=== ioredis ping (after failover, new client) ==="
MSYS_NO_PATHCONV=1 docker run --rm --network "$NET" \
  -v "$ROOT/shared:/app/shared:ro" \
  -e REDIS_SENTINELS -e REDIS_SENTINEL_NAME -e REDIS_PASSWORD \
  -w /app node:20-alpine sh -c '
    npm install ioredis --no-save --prefix /tmp/r >/dev/null 2>&1
    node -e "
      const Redis = require(\"/tmp/r/node_modules/ioredis\");
      const { buildIoredisOptions } = require(\"./shared/config/redisConnection\");
      const o = buildIoredisOptions();
      const { connectionUrl, ...rest } = o;
      const c = connectionUrl ? new Redis(connectionUrl, rest) : new Redis(rest);
      c.ping().then(r => { console.log(\"PING\", r); return c.quit(); }).catch(e => { console.error(e); process.exit(1); });
    "
  ' || FAIL=1

echo ""
echo "=== Cleanup sentinel test stack ==="
docker compose \
  -f "$SENTINEL_DIR/docker-compose.sentinel.yml" \
  -f "$SENTINEL_DIR/docker-compose.sentinel.local.yml" \
  -p "$COMPOSE_PROJECT" \
  down

if [[ "$FAIL" -ne 0 ]]; then
  echo "redis-client-failover-chaos: FAILED"
  exit 1
fi
echo ""
echo "redis-client-failover-chaos: PASSED"
