# Plan A / Phase 1 Cutover Runbook

## Phase 1 (P1-Cutover) — Stateful HA

**Prerequisites:** Atlas verified, Redis Sentinel + Rabbit cluster tested độc lập, quorum queues deployed.

```bash
# App stack + HA infra (Redis Sentinel + Rabbit cluster)
DEPLOY_HA_INFRA=1 bash devops/swarm/deploy-stack.sh
```

> Snapshot / rolling-update Phase 1 helper scripts đã gỡ — snapshot volume/DB thủ công trước cutover nếu cần.

**Rollback Plan A:** [`phase1-rollback.md`](./phase1-rollback.md) — `STACK_FILE=docker-stack.plan-a.yml`

**Verify stacks:**

```bash
docker stack services voicehub          # không còn mongodb/redis/rabbit single
docker stack services voicehub-redis
docker stack services voicehub-rabbit
```

## 1) Pre-check
1. **Dừng Docker Compose dev** — `voicehub_enterprise-network` không được là bridge từ Compose (xung đột tên với overlay Swarm):
   ```bash
   docker compose -f docker-compose.core.yml -f docker-compose.infra.yml down
   docker network rm voicehub_enterprise-network 2>/dev/null || true
   ```
2. `docker info` confirms Swarm active.
3. All required images exist in registry.
4. Node labels exist: `voice=true`, `ai=true`.
5. `.env` has image tags and required tokens.
6. `REDIS_SENTINELS`, `RABBITMQ_URL=@rabbitmq-1:5672`, `mongodb+srv://` trong service `.env`.

## 2) Deploy order
1. Deploy app stack (`docker-stack.yml` — không single-node stateful).
2. Deploy `voicehub-redis` + `voicehub-rabbit` HA stacks (shared overlay `voicehub_enterprise-network`).
3. Deploy API services (included in stack).
4. Deploy workers (`project-worker`, `ai-task-*`, `notification-dispatch-worker`).
5. Deploy realtime/voice.
6. Đổi `.env` sau deploy → `bash devops/swarm/deploy-stack.sh` hoặc `docker service update --force` từng service.

## 3) Canary checks
1. Login + gateway health.
2. Chat message realtime.
3. Upload file -> task queue path (`task-file-worker`).
4. AI extract/sync jobs.
5. Voice 2 users.

## 4) Rollback rules
- Any critical API 5xx spike > 5 minutes: rollback latest service.
- Queue backlog growth without drain > 10 minutes: scale worker or rollback worker image.
- Realtime disconnect spike: rollback `socket-service` and verify sticky session.

Rollback command:
`docker service update --rollback <stack>_<service>`
