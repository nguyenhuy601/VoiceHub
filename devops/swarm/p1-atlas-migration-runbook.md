# P1-Mongo — Atlas Migration Runbook

**Phụ thuộc:** [phase1-prep-runbook.md](./phase1-prep-runbook.md)  
**Tiếp theo:** [cutover/p1-swarm-stack-cutover](../../.cursor/plans/phase-1-stateful-ha/cutover/p1-swarm-stack-cutover.plan.md) (gỡ `mongodb` service sau verify)  
**Config (no secrets):** [`docs/atlas-staging-config.md`](../../docs/atlas-staging-config.md)

## Mục tiêu

- Mọi microservice kết nối `mongodb+srv://` Atlas
- Data staging đầy đủ (per logical DB)
- Smoke: login, chat history, org list
- Không service trỏ `mongodb:27017`

## 1. Atlas cluster (console)

| Bước | Hành động | Ghi chú |
|------|-----------|---------|
| 1 | Tạo project `voicehub-staging` | |
| 2 | Cluster **M10+**, 3 electable nodes | Region gần Swarm (vd. `ap-southeast-1`) |
| 3 | Connection string `mongodb+srv://` | TLS tự động |
| 4 | Database user scoped | `readWrite` trên từng logical DB (hoặc cluster user + path DB trong URI) |
| 5 | Network Access | IP egress Swarm staging; dev LAN tạm `0.0.0.0/0` chỉ staging |
| 6 | Backup | Atlas continuous backup bật |

Checklist chi tiết: [`docs/atlas-staging-config.md`](../../docs/atlas-staging-config.md).

## 2. Data migration

Từ backup P1-0 (`backup/phase1-YYYY-MM-DD/`):

```bash
# Restore tất cả logical DB lên Atlas (đọc URI từ services/*/.env)
bash devops/scripts/phase1-mongorestore-atlas.sh --backup backup/phase1-2026-06-12

# Chỉ verify collection counts (không restore)
bash devops/scripts/phase1-mongorestore-atlas.sh --verify-only
```

**Đã có data trên Atlas:** chạy `--verify-only` so sánh count với backup hoặc skip restore.

## 3. URI cutover (staging `.env`)

```bash
node devops/scripts/phase1-atlas-uri-cutover.mjs
bash devops/scripts/phase1-atlas-uri-audit.sh
```

Biến bắt buộc:

| Service | Biến |
|---------|------|
| Hầu hết | `MONGODB_URI=mongodb+srv://***@cluster/.../<db>` |
| chat-service | `CHAT_MONGODB_URI` (+ `MONGODB_URI` fallback) |
| ai-task-service, ai-task-worker | `AI_TASK_MONGODB_URI` (+ `MONGODB_URI`) |

**Thứ tự deploy rolling (downtime ngắn):** auth → user → role-permission → org → friend → notification → document → voice → task → chat → ai-task-service → ai-task-worker

Ghi downtime thực tế vào runbook khi chạy staging.

## 4. Verify

```bash
# Log mong đợi sau deploy rolling:
docker service logs voicehub_auth-service --tail 20 | grep -i atlas
```

**E2E thủ công:**

- Login / refresh token
- DM list + chat history
- Org workspace list
- Task board

Log mong đợi: `[MongoDB] Using Atlas connection (mongodb+srv://)`

## 5. Rollback

1. Revert `.env` URI về local `mongodb://...@mongodb:27017/...` (snapshot prep)
2. `mongorestore` backup P1-0 vào container local
3. Redeploy stack có service `mongodb`
4. Không gỡ `mongodb` khỏi `docker-stack.yml` cho đến khi verify Atlas ổn định ≥ 24h

## Tiêu chí hoàn thành P1-Mongo

- [ ] Atlas M10+ RS + allowlist + user scoped
- [ ] Data migrate / verify counts
- [ ] `CHAT_MONGODB_URI`, `AI_TASK_MONGODB_URI` set; audit pass
- [ ] E2E login/chat/org OK (thủ công)
