# P2-Workers — Manual autoscale runbook (Swarm)

**Policy:** [`autoscale-policy.md`](./autoscale-policy.md)  
**Scripts:** [`scale-workers.sh`](./scale-workers.sh), [`run-p2-worker-queue-drain.sh`](./run-p2-worker-queue-drain.sh)  
**Inventory:** [`docs/phase2-replica-inventory-staging.md`](../../docs/phase2-replica-inventory-staging.md)

## Mục tiêu

Scale queue workers **thủ công** trên Docker Swarm (không HPA/autoscaler plugin). Verify queue drain sau burst và có rollback rõ ràng.

## Guardrails (staging single-node)

| Worker | Min | Staging max | Placement |
|--------|-----|-------------|-----------|
| task-worker | 1 | 2–3 | any |
| notification-dispatch-worker | 1 | 2–3 | IO-bound |
| webhook-delivery-worker | 1 | 2–3 | IO-bound |
| ai-task-extract-worker | 1 | 2 | `node.labels.ai == true` |
| ai-task-sync-worker | 1 | 2 | `node.labels.ai == true` |

**DB-bound (`task-worker`):** tăng tối đa **+1 replica / 10 phút**; theo dõi Mongo connection trước khi scale tiếp.

**AI workers:** không vượt `P2_WORKER_MAX_REPLICAS` nếu Docker Desktop thiếu RAM.

## Scale out (manual)

### Cách 1 — `.env` + stack deploy (khuyến nghị, reproducible)

```bash
# Root .env (ví dụ staging burst window)
TASK_WORKER_REPLICAS=2
NOTIFICATION_DISPATCH_WORKER_REPLICAS=2
WEBHOOK_DELIVERY_WORKER_REPLICAS=2
AI_TASK_EXTRACT_WORKER_REPLICAS=2
AI_TASK_SYNC_WORKER_REPLICAS=2

bash devops/swarm/scale-workers.sh deploy
```

### Cách 2 — `docker service scale` nhanh

```bash
bash devops/swarm/scale-workers.sh up 2
```

## Scale in (rollback)

```bash
bash devops/swarm/scale-workers.sh down
```

Hoặc restore từ [`backup/phase2-prep-2026-06-19/replica-env-snapshot.txt`](../../backup/phase2-prep-2026-06-19/replica-env-snapshot.txt) (worker vars = 1) rồi `scale-workers.sh deploy`.

## Verify sau scale

```bash
bash devops/swarm/scale-workers.sh status
bash devops/swarm/run-p2-worker-queue-drain.sh
```

### Queue drain pass criteria

- Critical queue depth → **~0** trong `P2_DRAIN_WAIT_SEC` (default 90s)
- DLQ không spike bất thường (so với retry exhausted)
- Worker replicas **N/N** ổn định, không restart loop

## Burst test (notification / webhook)

1. Baseline: `rabbitmqctl list_queues`
2. Burst publish (no-op webhook events — unknown `event_type` → ack nhanh):

```bash
bash devops/swarm/run-p2-worker-queue-drain.sh
```

3. So sánh thời gian drain **1 vs 2 replica** (optional benchmark)

## Idempotency / double consume

Phase 1 đã có:

- DM: `dm:corr` / quorum consumers
- Org events: idempotency keys

Khi scale in về 1 replica: không xóa queue; chỉ giảm consumer count.

## Rollback nhanh

```bash
docker service scale \
  voicehub_task-worker=1 \
  voicehub_notification-dispatch-worker=1 \
  voicehub_webhook-delivery-worker=1 \
  voicehub_ai-task-extract-worker=1 \
  voicehub_ai-task-sync-worker=1
```

**Ops note:** Nếu webhook worker báo `PRECONDITION_FAILED` trên `voicehub.webhook.delivery.dlq` (classic vs quorum), xóa DLQ classic rồi force-update worker:

```bash
RAB=$(docker ps -q -f name=voicehub-rabbit_rabbitmq-1 | head -1)
docker exec "$RAB" rabbitmqctl delete_queue voicehub.webhook.delivery.dlq
docker service update --force voicehub_webhook-delivery-worker
```

## References

- [`autoscale-policy.md`](./autoscale-policy.md)
- [`load-chaos-validation.md`](./load-chaos-validation.md)
- [`observability-baseline.md`](./observability-baseline.md)
