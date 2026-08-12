# P1-Cutover — Rollback (Plan A)

> **Plan A** = single-node `mongodb` + `redis` + `rabbitmq` trong stack `voicehub`, Mongo URI local/Atlas tùy `.env` backup.

**Checkpoint file:** `docker-stack.plan-a.yml`  
**Snapshot script:** `bash devops/swarm/phase1-pre-cutover-snapshot.sh`

## Khi nào rollback

| Triệu chứng | Hành động |
|-------------|-----------|
| App không connect Redis Sentinel | Rollback env Redis Plan A + redeploy Plan A stack |
| Rabbit cluster quorum / declare lỗi | Rollback `RABBITMQ_URL` → `rabbitmq:5672` + Plan A stack |
| Atlas unreachable (ngoài scope cutover) | Giữ stack app; sửa Atlas allowlist — **không** bật lại `mongodb` service nếu data đã trên Atlas |
| Toàn stack unstable | Full Plan A rollback bên dưới |

## Rollback nhanh — một service

```bash
STACK=voicehub
docker service update --rollback "${STACK}_socket-service"
docker service update --rollback "${STACK}_chat-service"
```

Chi tiết: [`rollback-runbook.md`](./rollback-runbook.md)

## Rollback Plan A — full infra

### 1. Khôi phục `.env` backup

Từ secret manager / `backup/phase1-cutover-*/env-infra-masked.txt` (chỉ tham chiếu — dùng bản đầy đủ):

```bash
# Plan A values (ví dụ — lấy từ backup thật)
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_USE_AUTH=false
# REDIS_SENTINELS=   # comment / xóa
RABBITMQ_URL=amqp://voicehub:***@rabbitmq:5672
# RABBITMQ_QUORUM_QUEUES=false  # nếu quorum gây lỗi
```

Service `.env` (`services/*/.env`): giữ `mongodb+srv://` nếu đã cutover Atlas — **không** revert DB trừ khi có kế hoạch restore riêng.

### 2. Gỡ HA stacks (tùy chọn)

```bash
docker stack rm voicehub-rabbit
docker stack rm voicehub-redis
# Chờ drain task
```

### 3. Redeploy Plan A compose

```bash
STACK_FILE=docker-stack.plan-a.yml bash devops/swarm/deploy-stack.sh
```

Hoặc:

```bash
export STACK_FILE=docker-stack.plan-a.yml
bash devops/swarm/deploy-stack.sh
```

### 4. Rolling recreate

```bash
STACK_FILE=docker-stack.plan-a.yml bash devops/swarm/rolling-update-phase1-env.sh
```

### 5. Verify

```bash
docker stack services voicehub | grep -E 'mongodb|redis|rabbitmq'
docker stack ps voicehub --no-trunc | head -30
curl -sS http://localhost:3000/health
```

**Pass:** `voicehub_mongodb`, `voicehub_redis`, `voicehub_rabbitmq` running; login + DM smoke OK.

## Volume data Plan A

| Volume | Ghi chú |
|--------|---------|
| `voicehub_mongodb_data` | Có thể còn trên node nếu chưa `docker volume rm` |
| `voicehub_redis_data` | Idem |
| `voicehub_rabbitmq_data` | Idem |

Restore volume từ `backup/phase1-volumes-YYYY-MM-DD/` nếu cần data cũ — xem [`phase1-prep-runbook.md`](./phase1-prep-runbook.md).

## Git checkpoint

```bash
git tag -l 'phase1-cutover-*'
git checkout <tag-before-cutover> -- docker-stack.yml .env   # chỉ khi cần
```

## Liên quan

- [`cutover-runbook.md`](./cutover-runbook.md) — deploy order
- [`deploy-phase1-cutover.sh`](./deploy-phase1-cutover.sh) — cutover forward
- [`p1-quorum-migration.md`](./rabbitmq-cluster/p1-quorum-migration.md) — quorum rollback
