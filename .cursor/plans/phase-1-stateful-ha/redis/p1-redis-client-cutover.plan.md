---
name: p1-redis-client-cutover
overview: P1-Redis-B — Cập nhật shared ioredis + socket-service Redis adapter hỗ trợ Sentinel/URL; chaos failover.
todos:
  - id: shared-redis-sentinel
    content: shared/config/redis.js — REDIS_URL hoặc REDIS_SENTINELS + REDIS_SENTINEL_NAME
    status: completed
  - id: socket-adapter-sentinel
    content: socket-service server.js — adapter createClient dùng cùng config
    status: completed
  - id: env-staging-redis
    content: Cập nhật .env staging; redeploy services dùng Redis
    status: completed
  - id: redis-failover-chaos
    content: Kill master — realtime HA checklist pass
    status: completed
isProject: false
---

# P1-Redis-B — Client Cutover

**Phụ thuộc:** [p1-redis-sentinel-stack.plan.md](p1-redis-sentinel-stack.plan.md)  
**Tiếp theo:** [rabbitmq/p1-rabbit-cluster-stack.plan.md](../rabbitmq/p1-rabbit-cluster-stack.plan.md)  
**Tiêu chí:** Stateful HA — Redis app

## 1. Mục tiêu & phạm vi

### Done
- `connectRedis()` hoạt động với Sentinel hoặc `REDIS_URL`
- Socket.IO `@socket.io/redis-adapter` reconnect sau failover
- Presence, BFF cache, `dm:corr:*` hoạt động sau kill master
- [`realtime-ha-checklist.md`](../../../devops/swarm/realtime-ha-checklist.md) pass

### In-scope
- [`shared/config/redis.js`](../../../shared/config/redis.js)
- [`services/socket-service/src/server.js`](../../../services/socket-service/src/server.js) — `createClient` adapter
- Staging `.env`

### Out-of-scope
- Refactor mọi `getRedisClient()` call site
- Redis Cluster sharding

## 2. Files affected

| Sửa | Verify |
|-----|--------|
| `shared/config/redis.js` | auth, gateway BFF, chat, socket presence |
| `socket-service/src/server.js` | Redis adapter init |

## 3. Thiết kế & trách nhiệm

**Ưu tiên env:**
1. `REDIS_URL` (direct hoặc redis://:pass@redis-master:6379)
2. `REDIS_SENTINELS=host1:26379,host2:26379` + `REDIS_SENTINEL_NAME=mymaster` + `REDIS_PASSWORD`
3. Fallback `REDIS_HOST`/`REDIS_PORT` (dev compose)

**ioredis Sentinel:**
```js
{ sentinels: [...], name: 'mymaster', password, sentinelPassword }
```

**socket-service:** dùng `redis` package — `createClient({ url })` hoặc sentinel URL documented; test pub/sub reconnect.

## 4. Thứ tự triển khai

1. Implement Sentinel branch trong `connectRedis` — unit smoke local
2. Align socket adapter URL builder với shared convention
3. Update staging `.env`
4. Rolling deploy: socket-service → gateway → chat → auth → workers
5. Chaos: failover master — 2 browser DM + presence
6. Gỡ single `redis` service ở stack cutover

## 5. Test plan

- BFF bootstrap cache hit/miss
- DM idempotency `dm:corr:*` sau failover
- Socket 2 replica + adapter — kill master < 30s recovery
- `SOCKET_IO_REDIS_ADAPTER=true` unchanged behavior

## 6. Risk & trade-off

| Rủi ro | Quyết định | Rollback |
|--------|------------|----------|
| ioredis vs redis package khác config | Document 2 env patterns; test socket riêng | `REDIS_HOST=redis` single |
| Adapter không reconnect | explicit `reconnectStrategy` node-redis | Restart socket-service |
