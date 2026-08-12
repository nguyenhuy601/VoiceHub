# P2-0 — Prep, Replica Inventory & Load Baseline Runbook

**Phụ thuộc:** [Gate G1 PASS](../../docs/phase-gate-2026-06-19-g1.md)  
**Tiếp theo:** [p2-gateway-scale](../../.cursor/plans/phase-2-stateless-scale/gateway/p2-gateway-scale.plan.md)  
**Inventory:** [`docs/phase2-replica-inventory-staging.md`](../../docs/phase2-replica-inventory-staging.md)

## Mục tiêu

Trước khi scale gateway/workers (Phase 2):

1. Snapshot replica desired vs running mọi service Swarm
2. Ghi load baseline (gateway p95, queue depth, socket config)
3. Checkpoint rollback giá trị `*_REPLICAS`

## Maintenance / scale window (staging template)

| Mục | Giá trị |
|-----|---------|
| **Window đề xuất** | Ngày làm việc 22:00–24:00 ICT hoặc slot Dev lead approve |
| **Freeze** | Không deploy Phase 1 infra trong window scale |
| **Duration ước tính** | P2-0 prep ~30 ph; gateway scale (plan tiếp) ~1h |

## Thứ tự thực hiện (P2-0)

### 1. Checkpoint & tag

```bash
STAMP=$(date +%Y-%m-%d)
mkdir -p "backup/phase2-prep-${STAMP}"
docker stack services voicehub > "backup/phase2-prep-${STAMP}/stack-services.txt"
docker stack ps voicehub --filter desired-state=running --no-trunc \
  > "backup/phase2-prep-${STAMP}/stack-tasks-running.txt"
# Copy replica-env-snapshot.txt template from docs/phase2-replica-inventory-staging.md
git tag -a "phase2-prep-${STAMP}" -m "P2-0 prep checkpoint"
```

### 2. Replica inventory

```bash
# Desired vs running
docker stack services voicehub

# Env overrides (root .env only — không commit secret)
grep REPLICAS .env || true

# Cross-check stack defaults
grep 'REPLICAS' docker-stack.yml
```

Ghi kết quả vào [`docs/phase2-replica-inventory-staging.md`](../../docs/phase2-replica-inventory-staging.md).

### 3. Load baseline

```bash
curl -sf http://127.0.0.1:3000/health
for i in $(seq 1 20); do curl -sf -o /dev/null -w '%{time_total}\n' http://127.0.0.1:3000/health; done
# Ghi p95 gateway + socket probe vào inventory doc
```

Queue depth (critical queues — xem [`observability-baseline.md`](./observability-baseline.md)):

```bash
RAB=$(docker ps -q -f name=voicehub-rabbit_rabbitmq-1 | head -1)
docker exec "$RAB" rabbitmqctl list_queues name type messages consumers \
  | grep -E 'voicehub\.|task-ai'
```

Socket adapter check:

```bash
GW=$(docker ps -q -f name=voicehub_api-gateway | head -1)
docker exec "$GW" node -e \
  "require('http').get('http://socket-service:3017/health',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>console.log(d))})"
```

### 4. Manual nominal smoke

- Login staging URL
- Gửi 1 DM
- (Tuỳ chọn) upload file → task worker — queue depth vẫn ~0

### 5. Team sign-off

- Inventory ≥15 replica vars documented
- Baseline timestamp + p95 recorded
- Approve scale window trước `p2-gateway-scale`

## Rollback replica values

Nếu Phase 2 scale gây regress:

1. Restore `*_REPLICAS` từ [`backup/phase2-prep-2026-06-19/replica-env-snapshot.txt`](../../backup/phase2-prep-2026-06-19/replica-env-snapshot.txt) vào `.env`
2. Redeploy:

```bash
SWARM_USE_LOCAL_IMAGES=1 bash devops/swarm/deploy-stack.sh
```

3. Per-service nhanh:

```bash
docker service scale voicehub_api-gateway=1
docker service update --rollback voicehub_api-gateway
```

**Không rollback Phase 1 HA stacks** (`voicehub-redis`, `voicehub-rabbit`) trừ khi incident infra — xem [`phase1-rollback.md`](./phase1-rollback.md).

## Success criteria (P2-0 done)

- [x] `docs/phase2-replica-inventory-staging.md` — replica table + baseline metrics
- [x] `backup/phase2-prep-YYYY-MM-DD/` — stack snapshot + replica env
- [x] Load smoke pass at checkpoint
- [ ] Git tag `phase2-prep-YYYY-MM-DD` (operator)
- [ ] Manual smoke tick (operator)

## References

- [OPERATIONS.md](./OPERATIONS.md) — sau `API_GATEWAY_REPLICAS=2`
- [`observability-baseline.md`](./observability-baseline.md)
- [`load-chaos-validation.md`](./load-chaos-validation.md)
- [`ha-infra-roadmap.md`](./ha-infra-roadmap.md) — Phase 2 section
