# P1-Redis-A — Redis Sentinel Stack

**Plan:** [p1-redis-sentinel-stack.plan.md](../../../.cursor/plans/phase-1-stateful-ha/redis/p1-redis-sentinel-stack.plan.md)  
**Tiếp theo:** [p1-redis-client-cutover.plan.md](../../../.cursor/plans/phase-1-stateful-ha/redis/p1-redis-client-cutover.plan.md)

## Kiến trúc

```text
redis-master:6379          (AOF, requirepass)
redis-replica-1, redis-replica-2   (replicaof + masterauth)
redis-sentinel-1..3:26379  (monitor mymaster, quorum 2)
```

Overlay: `enterprise-network` (external `voicehub_enterprise-network` khi deploy Swarm).

**Không publish** `6379` / `26379` ra host — chỉ nội bộ overlay.

## Biến môi trường (root `.env`)

```bash
REDIS_PASSWORD=<staging-secret>
REDIS_SENTINEL_NAME=mymaster   # optional, default mymaster
```

Giữ `REDIS_HOST`/`REDIS_PORT` cho single-redis dev cho đến P1-Redis-B cutover.

## Deploy Swarm

```bash
# Main stack phải tạo overlay trước
bash devops/swarm/deploy-stack.sh

bash devops/swarm/redis-sentinel/deploy-sentinel-stack.sh
```

Placement: `spread: node.id` trên mọi service — **true HA cần ≥2 Swarm nodes** (3 nodes khuyến nghị cho master + 2 replica spread).

## Client cutover (P1-Redis-B) — đã implement

`shared/config/redis.js` + socket adapter đọc cùng profile:

1. `REDIS_URL`
2. `REDIS_SENTINELS` + `REDIS_SENTINEL_NAME` + `REDIS_PASSWORD`
3. `REDIS_HOST` / `REDIS_PORT` (+ `REDIS_USE_AUTH=true` nếu single redis có pass)

Staging Swarm: uncomment `REDIS_SENTINELS` trong root `.env`, set `REDIS_USE_AUTH=true`, redeploy socket → gateway → chat → auth.

```bash
bash devops/swarm/redis-sentinel/run-redis-client-failover-chaos.sh
```

## DNS cho client (P1-Redis-B)

| Mục đích | Giá trị |
|----------|---------|
| Sentinel endpoints | `redis-sentinel-1:26379`, `redis-sentinel-2:26379`, `redis-sentinel-3:26379` |
| Sentinel name | `mymaster` |
| Direct master (debug) | `redis-master:6379` |

```bash
REDIS_SENTINELS=redis-sentinel-1:26379,redis-sentinel-2:26379,redis-sentinel-3:26379
REDIS_SENTINEL_NAME=mymaster
REDIS_PASSWORD=...
```

## Verify

```bash
# Local compose (không cần Swarm)
bash devops/swarm/redis-sentinel/run-sentinel-failover-test.sh

# Đã deploy Swarm stack voicehub-redis
REDIS_SENTINEL_MODE=swarm bash devops/swarm/redis-sentinel/run-sentinel-failover-test.sh

node tests/redis-sentinel-stack.smoke.js
```

## Cutover từ single `redis`

1. Deploy Sentinel stack (file này)
2. P1-Redis-B: `shared/config/redis.js` + `.env` Sentinel
3. [stack cutover](../cutover-runbook.md): scale down / remove `redis` service trong `docker-stack.yml`

## Rollback

```bash
docker stack rm voicehub-redis
# App vẫn trỏ REDIS_HOST=redis (single service) cho đến client cutover
```
