---
name: p1-prep-backup-inventory
overview: P1-0 — Backup, inventory URI/queue/key, maintenance window trước migrate stateful HA (hybrid).
todos:
  - id: mongodump-backup
    content: mongodump full hoặc per-DB logic; verify restore trên clone
    status: completed
  - id: uri-inventory
    content: Liệt kê MONGODB_URI, CHAT_MONGODB_URI, AI_TASK_MONGODB_URI từng service
    status: completed
  - id: queue-redis-inventory
    content: Liệt kê Rabbit queue + Redis key prefix critical
    status: completed
  - id: maintenance-window
    content: Ghi maintenance window + snapshot volume Redis/Rabbit
    status: completed
isProject: false
---

# P1-0 — Prep, Backup & Inventory

**Phụ thuộc:** [stabilization sign-off](../../stabilization/00-master-index.plan.md) + [Gate G0 PASS](../../phase-gates/gates/gate-s0-to-p1.plan.md)  
**Tiếp theo:** [mongodb/p1-atlas-migration.plan.md](../mongodb/p1-atlas-migration.plan.md) (song song có thể bắt đầu redis/rabbit stack sau bước inventory)  
**Tiêu chí:** Nền Phase 1

## 1. Mục tiêu & phạm vi

### Done
- Backup Mongo restore được trên staging clone
- File inventory: URI Mongo, Rabbit queue, Redis prefix
- Snapshot volume `redis_data`, `rabbitmq_data` (hoặc export policy)
- Maintenance window + rollback checkpoint documented

### In-scope
- [`devops/swarm/`](../../../devops/swarm/) — runbook prep (mới)
- Staging `.env` inventory (không commit secret)
- [`devops/swarm/observability-baseline.md`](../../../devops/swarm/observability-baseline.md)

### Out-of-scope
- Thay đổi `docker-stack.yml` production cutover
- Sửa application code

## 2. Files affected

| Tạo/sửa | Không đụng |
|---------|------------|
| `devops/swarm/phase1-prep-runbook.md` (mới) | Service business logic |
| `docs/phase1-inventory-staging.md` (mới, no secrets) | `api-gateway` auth |

## 3. Thiết kế & trách nhiệm

| Thành phần | Trách nhiệm |
|------------|-------------|
| DevOps | `mongodump`, volume snapshot, inventory |
| Dev lead | Approve maintenance window |

**Mongo URI cần inventory:**
- `MONGODB_URI` — auth, user, org, friend, task, notification, …
- `CHAT_MONGODB_URI` — [`chat-service/src/server.js`](../../../services/chat-service/src/server.js)
- `AI_TASK_MONGODB_URI` — ai-task-service

**Rabbit queue (tối thiểu):** `voicehub.friend.dm`, `voicehub.notification.dispatch`, `task-ai.extract`, `task-ai.sync`, `voicehub.task.from_file`, `voicehub.webhook.delivery`, org event queues.

**Redis prefix:** `vh:presence:*`, `vh:friend_chat_focus:*`, `dm:corr:*`, `bff:*`, refresh token keys.

## 4. Thứ tự triển khai

1. Freeze deploy không liên quan trong maintenance window
2. `mongodump --uri=... --out=backup/phase1-YYYY-MM-DD`
3. Restore drill: 1 DB lên container/mongo tạm — verify document count
4. `docker run --rm -v voicehub_redis_data` snapshot hoặc `redis-cli SAVE`
5. Ghi inventory vào `docs/phase1-inventory-staging.md` (mask password)
6. Checkpoint: tag git + env export an toàn (secret manager)

## 5. Test plan

- Restore drill pass (document count ±0 trên sample collection)
- Inventory đủ 3 Mongo URI variants + 6+ queue names
- Team xác nhận maintenance window

## 6. Risk & trade-off

| Rủi ro | Quyết định | Rollback |
|--------|------------|----------|
| Backup thiếu DB logic | Dump per-database từ single mongo hiện tại | Re-run mongodump |
| Inventory lộ secret | Mask trong doc; secret chỉ trong `.env` | Xóa file commit nhầm |
