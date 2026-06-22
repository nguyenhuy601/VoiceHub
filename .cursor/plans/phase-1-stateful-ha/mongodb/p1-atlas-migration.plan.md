---
name: p1-atlas-migration
overview: P1-Mongo — Migrate MongoDB single-node Swarm sang Atlas Replica Set; cập nhật per-service URI.
todos:
  - id: atlas-cluster
    content: Tạo Atlas M10+ RS, IP allowlist, DB users scoped
    status: completed
  - id: data-migrate
    content: mongorestore / migration staging data lên Atlas
    status: completed
  - id: uri-cutover
    content: Cập nhật MONGODB_URI, CHAT_MONGODB_URI, AI_TASK_MONGODB_URI trong .env
    status: completed
  - id: verify-services
    content: Mọi service connectDB ping Atlas — login, chat, org smoke
    status: completed
isProject: false
---

# P1-Mongo — Atlas Migration

**Phụ thuộc:** [foundation/p1-prep-backup-inventory.plan.md](../foundation/p1-prep-backup-inventory.plan.md)  
**Tiếp theo:** [cutover/p1-swarm-stack-cutover.plan.md](../cutover/p1-swarm-stack-cutover.plan.md) (gỡ `mongodb` service)  
**Tiêu chí:** Stateful HA — Mongo

## 1. Mục tiêu & phạm vi

### Done
- Mọi microservice kết nối `mongodb+srv://` Atlas
- Data staging migrate đầy đủ (per DB logic)
- Smoke: login, chat history, org list đúng
- Không service trỏ `mongodb:27017`

### In-scope
- Staging `.env` — `MONGODB_URI`, `CHAT_MONGODB_URI`, `AI_TASK_MONGODB_URI`
- [`shared/config/mongo.js`](../../../shared/config/mongo.js) — verify Atlas options (đã có `retryWrites`)
- Gỡ `mongodb` khỏi stack (plan cutover, sau verify)

### Out-of-scope
- Sửa schema/index (trừ hotfix blocker)
- Mongo RS self-hosted trên Swarm (chọn hybrid Atlas)

## 2. Files affected

| Sửa | Không đụng |
|-----|------------|
| Staging `.env` | `mongo.js` (trừ bug Atlas) |
| [`docker-stack.yml`](../../../docker-stack.yml) — gỡ service ở cutover | JWT/auth |

## 3. Thiết kế & trách nhiệm

| Module | URI env |
|--------|---------|
| auth, user, org, friend, task, … | `MONGODB_URI` |
| chat-service | `CHAT_MONGODB_URI` \|\| `MONGODB_URI` |
| ai-task-service | `AI_TASK_MONGODB_URI` \|\| `MONGODB_URI` |

Atlas: 3-node RS, TLS auto (`mongodb+srv://`). Network: IP allowlist staging Swarm egress hoặc VPC peering.

## 4. Thứ tự triển khai

1. Tạo Atlas project + cluster M10+ (3 electable nodes)
2. Tạo user(s) — scoped DB theo mô hình hiện tại
3. Network access: allow staging egress IPs
4. `mongorestore` từ backup prep → verify collection counts
5. Cập nhật `.env` — deploy rolling từng service (auth → user → … → chat)
6. Smoke E2E trước khi gỡ local mongo
7. Cutover stack: remove `mongodb` service (plan cutover)

**Lưu ý:** Downtime staging ngắn chấp nhận được; ghi thời gian trong runbook.

## 5. Test plan

- Mỗi service log: `[MongoDB] Using Atlas connection`
- `connectDB` ping OK — no buffering timeout
- Login, DM list, org workspace, task board
- Token cũ vẫn valid (Mongo user data intact)

## 6. Risk & trade-off

| Rủi ro | Quyết định | Rollback |
|--------|------------|----------|
| Atlas latency | Chọn region gần Swarm | Revert URI local mongo + restore dump |
| IP allowlist sai | Test từ 1 service trước full cutover | Tạm 0.0.0.0/0 staging only |
| Chi phí Atlas | M10 staging; scale down sau test | Pause cluster |
