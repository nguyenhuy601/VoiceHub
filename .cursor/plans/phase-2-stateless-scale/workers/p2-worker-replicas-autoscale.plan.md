---
name: p2-worker-replicas-autoscale
overview: P2-Workers — Tăng replica workers theo autoscale-policy; queue drain verify.
todos:
  - id: worker-replica-bump
    content: Scale task/notification/webhook/ai workers theo policy manual
    status: completed
  - id: queue-drain-test
    content: Burst publish — depth về ~0 sau scale
    status: completed
  - id: autoscale-runbook
    content: Script hoặc runbook scale-in/out (Swarm manual)
    status: completed
isProject: false
---

# P2-Workers — Replicas & Autoscale Policy

**Phụ thuộc:** [p2-gateway-scale](../gateway/p2-gateway-scale.plan.md)  
**Tiếp theo:** [voice/p2-voice-udp-strategy.plan.md](../voice/p2-voice-udp-strategy.plan.md)  
**Tiêu chí:** Queue workers scale

## 1. Mục tiêu & phạm vi

### Done
- Worker replica tăng theo [`autoscale-policy.md`](../../../devops/swarm/autoscale-policy.md) (manual/script)
- Queue depth drain sau burst test
- Min/max guardrails documented

### In-scope
- `task-worker`, `notification-dispatch-worker`, `webhook-delivery-worker`
- `ai-task-extract-worker`, `ai-task-sync-worker`
- Rabbit quorum queues (Phase 1)

### Out-of-scope
- Kubernetes HPA / Swarm autoscaler plugin
- Refactor worker code

## 2. Files affected

| Sửa | Pattern |
|-----|---------|
| `.env` `*_WORKER_REPLICAS` | Manual scale |
| `devops/swarm/scale-workers.sh` (mới, optional) | `docker service scale` wrapper |
| `docker-stack.yml` | `update_config.order: start-first` (đã có workers) |

## 3. Thiết kế & trách nhiệm

**Policy summary** ([autoscale-policy.md](../../../devops/swarm/autoscale-policy.md)):

| Worker | Scale out khi | Max caution |
|--------|---------------|-------------|
| ai-task-extract/sync | CPU >70% 5m hoặc queue >100 | node.labels.ai |
| notification/webhook | queue >200 hoặc retry >5% | IO-bound |
| task-worker | queue depth + DB locks | +1 / 10 phút |

Consumers đã có reconnect loop (P1-Rabbit-B).

## 4. Thứ tự triển khai

1. Baseline queue depth (`rabbitmqctl list_queues`)
2. Scale 1 worker type (ví dụ notification-dispatch) 1→2
3. Burst test notification async
4. Verify drain + no duplicate side effects
5. Lặp cho task-worker, webhook, ai workers
6. Ghi runbook scale-in

## 5. Test plan

- Notification dispatch bulk job — 1 replica vs 2 replica latency
- Task from file upload → worker
- DLQ chỉ khi exhausted retry (không spike bất thường)

## 6. Risk & trade-off

| Rủi ro | Quyết định | Rollback |
|--------|------------|----------|
| Double consume | Idempotency keys (`dm:corr`, org eventId) | Scale về 1 |
| AI node overload | placement `node.labels.ai` | Cap replica |
