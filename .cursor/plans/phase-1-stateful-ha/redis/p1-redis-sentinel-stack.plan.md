---
name: p1-redis-sentinel-stack
overview: P1-Redis-A — Deploy Redis master + replica + Sentinel trên Docker Swarm overlay.
todos:
  - id: sentinel-stack-files
    content: Tạo devops/swarm/redis-sentinel/ stack overlay (master, 2 replica, 3 sentinel)
    status: completed
  - id: redis-auth-persistence
    content: requirepass, masterauth, AOF persistence
    status: completed
  - id: placement-spread
    content: Placement spread >= 2 Swarm nodes; không expose 6379 public
    status: completed
  - id: sentinel-failover-test
    content: Manual Sentinel failover — elect new master
    status: completed
isProject: false
---

# P1-Redis-A — Sentinel Stack

**Phụ thuộc:** [foundation/p1-prep-backup-inventory.plan.md](../foundation/p1-prep-backup-inventory.plan.md)  
**Tiếp theo:** [p1-redis-client-cutover.plan.md](p1-redis-client-cutover.plan.md)  
**Tiêu chí:** Stateful HA — Redis infra

## 1. Mục tiêu & phạm vi

### Done
- Redis master + 2 replica + 3 Sentinel chạy trên `enterprise-network`
- `requirepass` bật; không publish 6379 ra host public
- Sentinel failover manual test pass
- DNS/service name documented cho client cutover

### In-scope
- `devops/swarm/redis-sentinel/` (stack compose mới)
- [`docker-stack.yml`](../../../docker-stack.yml) — thay/tham chiếu service `redis` single (ở cutover)

### Out-of-scope
- Sửa `shared/config/redis.js` (plan client cutover)
- Redis Cluster mode (chọn Sentinel)

## 2. Files affected

| Tạo | Sửa (cutover) |
|-----|---------------|
| `devops/swarm/redis-sentinel/docker-compose.sentinel.yml` | `docker-stack.yml` redis section |
| `devops/swarm/redis-sentinel/README.md` | Staging `.env` `REDIS_*` |

## 3. Thiết kế & trách nhiệm

```text
redis-master:6379
redis-replica-1, redis-replica-2 (replicaof master)
redis-sentinel-1..3 (monitor mymaster)
```

| Thành phần | Config |
|------------|--------|
| Master | AOF `appendonly yes` |
| Sentinel | `sentinel monitor mymaster redis-master 6379 2` |
| Swarm | `deploy.placement.preferences: spread` |

Client phase sau: `REDIS_SENTINELS=redis-sentinel-1:26379,...` + `REDIS_SENTINEL_NAME=mymaster`.

## 4. Thứ tự triển khai

1. Tạo stack file — master trước, replica join, sentinel monitor
2. Set password đồng bộ master/replica/sentinel auth-pass
3. Deploy overlay cùng `enterprise-network` với app stack
4. `redis-cli -a $PASS SENTINEL masters` — verify
5. `SENTINEL failover mymaster` — verify new master elected
6. Document service DNS cho client plan

**Lưu ý:** Staging 1-node Swarm = best-effort; true HA cần ≥3 nodes.

## 5. Test plan

```bash
redis-cli -h redis-sentinel-1 -p 26379 SENTINEL get-master-addr-by-name mymaster
redis-cli -a $PASS PING
# Kill master container → sentinel promotes replica < 30s
```

## 6. Risk & trade-off

| Rủi ro | Quyết định | Rollback |
|--------|------------|----------|
| 1-node Swarm không spread | Document min 3 nodes prod | Giữ single redis container |
| Split brain | Quorum 2 sentinel | Fix sentinel count |
