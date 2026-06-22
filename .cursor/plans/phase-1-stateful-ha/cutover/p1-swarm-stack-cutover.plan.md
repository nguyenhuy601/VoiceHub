---
name: p1-swarm-stack-cutover
overview: "P1-Cutover — Gộp docker-stack.yml: gỡ mongodb/redis/rabbit single; env rolling update toàn stack."
todos:
  - id: remove-mongodb-service
    content: Gỡ mongodb service + mongodb_data sau Atlas verified
    status: completed
  - id: embed-redis-rabbit-ha
    content: Thay redis/rabbit single bằng sentinel/cluster stack hoặc include overlay
    status: completed
  - id: rolling-env-update
    content: Rolling update mọi service với URI mới
    status: completed
  - id: rollback-checkpoint
    content: Document rollback Plan A snapshot
    status: completed
isProject: false
---

# P1-Cutover — Swarm Stack Cutover

**Phụ thuộc:** [p1-atlas-migration](../mongodb/p1-atlas-migration.plan.md), [p1-redis-client-cutover](../redis/p1-redis-client-cutover.plan.md), [p1-rabbit-quorum-queues](../rabbitmq/p1-rabbit-quorum-queues.plan.md)  
**Tiếp theo:** [validation/p1-failover-validation.plan.md](../validation/p1-failover-validation.plan.md)  
**Tiêu chí:** Gộp hạ tầng Phase 1

## 1. Mục tiêu & phạm vi

### Done
- `docker stack services voicehub` — không còn single-node `mongodb`
- Redis/Rabbit HA stack integrated hoặc deploy song song cùng network
- Mọi task running; env URI mới đồng bộ
- Rollback checkpoint documented

### In-scope
- [`docker-stack.yml`](../../../docker-stack.yml)
- [`devops/swarm/deploy-stack.sh`](../../../devops/swarm/deploy-stack.sh)
- Staging `.env`

### Out-of-scope
- Scale app replicas (Phase 2 hạ tầng)
- Code changes (đã xong ở redis/rabbit plans)

## 2. Files affected

| Sửa | Gỡ |
|-----|-----|
| `docker-stack.yml` | `mongodb` service block |
| `devops/swarm/deploy-stack.sh` (nếu multi-stack) | `redis` single 6379 publish public |
| Include sentinel/cluster compose | `rabbitmq` single |

## 3. Thiết kế & trách nhiệm

**Option A:** Embed HA services trong `docker-stack.yml`  
**Option B:** `docker stack deploy` riêng `voicehub-infra-ha` + shared overlay

Giữ DNS alias: `redis` → master hoặc document `REDIS_URL` only; `rabbitmq` → cluster entry.

| Checkpoint | Lệnh |
|------------|------|
| Pre-cutover | `docker stack ps voicehub` snapshot |
| Rollback | env Plan A + `docker stack deploy` previous compose |

## 4. Thứ tự triển khai

1. Verify Atlas + Sentinel + Rabbit cluster + quorum đã test độc lập
2. Maintenance window — thông báo team
3. Deploy HA infra stack (nếu tách)
4. Update `docker-stack.yml` — remove mongodb; update redis/rabbit refs
5. `docker stack deploy -c docker-stack.yml voicehub` với env mới
6. Rolling verify: gateway → socket → chat → workers
7. Ghi rollback trong `devops/swarm/phase1-rollback.md`

## 5. Test plan

```bash
docker stack services voicehub
docker stack ps voicehub --no-trunc
```

- Không task Failed
- Login + DM + notification smoke
- `check-security-env.sh` pass (Rabbit/Redis password)

## 6. Risk & trade-off

| Rủi ro | Quyết định | Rollback |
|--------|------------|----------|
| Stack deploy đứt network | Deploy infra HA trước, verify DNS | `docker stack rm` + redeploy Plan A |
| Env lệch giữa services | Single `.env` source; deploy atomic | Restore env backup |
