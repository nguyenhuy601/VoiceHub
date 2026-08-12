# P1-0 — Prep, Backup & Inventory Runbook

**Phụ thuộc:** [Stabilization sign-off](../../.cursor/plans/stabilization/00-master-index.plan.md)  
**Tiếp theo:** [MongoDB Atlas migration](../../.cursor/plans/phase-1-stateful-ha/mongodb/p1-atlas-migration.plan.md)  
**Inventory (no secrets):** [`docs/phase1-inventory-staging.md`](../../docs/phase1-inventory-staging.md)

## Mục tiêu

Trước khi cutover stateful HA (Mongo Atlas / Redis Sentinel / Rabbit quorum):

1. Backup Mongo restore được trên clone
2. Inventory URI / queue / Redis prefix (đã mask)
3. Snapshot volume `mongodb_data`, `redis_data`, `rabbitmq_data`
4. Maintenance window + rollback checkpoint

## Maintenance window (staging template)

| Mục | Giá trị |
|-----|---------|
| **Window đề xuất** | Chủ nhật 02:00–06:00 ICT (hoặc slot Dev lead approve) |
| **Freeze** | Không deploy app/infra không liên quan P1 trong window |
| **Thông báo** | Slack/#ops + calendar 48h trước |
| **On-call** | DevOps primary + Dev lead secondary |
| **Duration ước tính** | 2–4h (backup + inventory + snapshot; chưa gồm Atlas cutover) |

### Rollback checkpoint (trước khi đụng stack production)

1. Tag git: `git tag -a phase1-prep-YYYY-MM-DD -m "P1-0 prep checkpoint"`
2. Export env an toàn (secret manager / vault — **không** commit `.env`)
3. Ghi path backup: `backup/phase1-YYYY-MM-DD`, `backup/phase1-volumes-YYYY-MM-DD`
4. Xác nhận restore drill pass (một logical DB, document count khớp)
5. Inventory review: [`docs/phase1-inventory-staging.md`](../../docs/phase1-inventory-staging.md)

**Rollback nếu chỉ prep (chưa cutover):** giữ stack hiện tại; re-run mongodump nếu backup hỏng.

## Thứ tự thực hiện

### 1. Freeze & checkpoint

```bash
git tag -a phase1-prep-$(date +%Y-%m-%d) -m "P1-0 prep checkpoint"
# Export secrets qua secret manager (ngoài repo)
```

### 2. MongoDB backup

Compose local (container `enterprise-mongodb`):

```bash
bash devops/scripts/phase1-mongodump.sh --in-container
```

Staging / Atlas (đọc URI từ `services/<name>/.env` — không in ra console):

```bash
bash devops/scripts/phase1-mongodump.sh --from-service chat-service --db chat_db
```

Hoặc explicit (secret manager):

```bash
PHASE1_MONGODB_URI='mongodb+srv://***@cluster/...' bash devops/scripts/phase1-mongodump.sh
```

Per logical DB (khuyến nghị trước migrate):

```bash
for db in auth_db user_db chat_db friend_db organization_db task_db notification_db document_db voice_db role_permission_db ai_task_db; do
  bash devops/scripts/phase1-mongodump.sh --db "$db" --out "backup/phase1-$(date +%Y-%m-%d)/$db"
done
```

Output: `backup/phase1-YYYY-MM-DD/` (gitignored).

### 3. Restore drill

```bash
bash devops/scripts/phase1-restore-drill.sh \
  --backup backup/phase1-$(date +%Y-%m-%d) \
  --db chat_db
```

**Pass:** document count collection mẫu khớp source (±0) hoặc restore count > 0 khi không đọc được source (Atlas firewall).

### 4. Volume snapshot (Redis / Rabbit / Mongo)

Swarm:

```bash
STACK_NAME=voicehub bash devops/scripts/phase1-volume-snapshot.sh
```

Compose local:

```bash
PHASE1_REDIS_VOLUME=voicehub_redis_data \
PHASE1_RABBIT_VOLUME=voicehub_rabbitmq_data \
PHASE1_MONGO_VOLUME=voicehub_mongodb_data \
bash devops/scripts/phase1-volume-snapshot.sh
```

Script gọi `redis-cli SAVE` trước khi tar volume Redis (nếu container đang chạy).

Dry-run (chỉ manifest):

```bash
PHASE1_SNAPSHOT_DRY_RUN=1 bash devops/scripts/phase1-volume-snapshot.sh
```

### 5. Inventory

Cập nhật [`docs/phase1-inventory-staging.md`](../../docs/phase1-inventory-staging.md) từ staging `.env` (mask password). Không commit secret.

Verify:

```bash
node tests/phase1-prep-inventory.smoke.js
```

## Swarm volumes (docker-stack.yml)

| Volume | Mount |
|--------|-------|
| `mongodb_data` | `/data/db` |
| `redis_data` | `/data` |
| `rabbitmq_data` | `/var/lib/rabbitmq` |

## Tiêu chí hoàn thành P1-0

- [ ] `mongodump` + restore drill pass
- [ ] Inventory đủ 3 biến Mongo (`MONGODB_URI`, `CHAT_MONGODB_URI`, `AI_TASK_MONGODB_URI`) + 6+ queue
- [ ] Snapshot volume hoặc export policy documented
- [ ] Maintenance window approved
- [ ] `phase1-prep-inventory.smoke.js` pass

## Liên quan

- [observability-baseline.md](./observability-baseline.md) — queue depth baseline
- [env-secrets-inventory.md](./env-secrets-inventory.md) — rotate secrets S0
