---
name: p2-prep-replica-baseline
overview: P2-0 — Inventory replica hiện tại, load baseline trước scale gateway/workers.
todos:
  - id: replica-inventory
    content: Liệt kê *_REPLICAS từ docker-stack.yml + .env staging
    status: completed
  - id: load-baseline
    content: Ghi p95 gateway + queue depth nominal trước scale
    status: completed
  - id: scale-checkpoint
    content: Snapshot stack + rollback replica values
    status: completed
isProject: false
---

# P2-0 — Prep, Replica Inventory & Load Baseline

**Phụ thuộc:** [p1-failover-validation](../phase-1-stateful-ha/validation/p1-failover-validation.plan.md) + [Gate G1 PASS](../phase-gates/gates/gate-p1-to-p2.plan.md)  
**Tiếp theo:** [gateway/p2-gateway-scale.plan.md](../gateway/p2-gateway-scale.plan.md)  
**Tiêu chí:** Nền Phase 2

## 1. Mục tiêu & phạm vi

### Done
- Bảng replica mọi service Swarm (desired vs running)
- Baseline load: gateway p95, queue depth, socket reconnect rate
- Rollback checkpoint: giá trị `*_REPLICAS` trước scale

### In-scope
- [`docker-stack.yml`](../../../docker-stack.yml) env `*_REPLICAS`
- [`observability-baseline.md`](../../../devops/swarm/observability-baseline.md)
- Staging `.env` (không commit secret)

### Out-of-scope
- Thay đổi code application
- Autoscale automation

## 2. Files affected

| Tạo | Không đụng |
|-----|------------|
| `docs/phase2-replica-inventory-staging.md` | Auth/JWT |
| `devops/swarm/phase2-prep-runbook.md` | Phase 1 infra stacks |

## 3. Thiết kế & trách nhiệm

**Replica vars (tối thiểu inventory):**

| Service | Env var | Default stack |
|---------|---------|---------------|
| api-gateway | `API_GATEWAY_REPLICAS` | 1 |
| socket-service | `SOCKET_SERVICE_REPLICAS` | 2 (S3) |
| task-worker | `TASK_WORKER_REPLICAS` | 1 |
| notification-dispatch-worker | `NOTIFICATION_DISPATCH_WORKER_REPLICAS` | 1 |
| webhook-delivery-worker | `WEBHOOK_DELIVERY_WORKER_REPLICAS` | 1 |
| ai-task-extract/sync | `AI_TASK_*_WORKER_REPLICAS` | 1 |

**Baseline metrics:** queue depth critical (xem Phase 1 inventory), `docker stack ps` restart count.

## 4. Thứ tự triển khai

1. `docker stack services voicehub` — snapshot
2. Ghi replica + node placement vào inventory doc
3. Chạy smoke nominal load (login, DM, 1 task job)
4. Ghi queue depth + latency ước lượng
5. Tag git `phase2-prep-YYYY-MM-DD`

## 5. Test plan

- Inventory đủ 15+ service replica vars
- Baseline doc có timestamp + stack task count
- Team approve scale window

## 6. Risk & trade-off

| Rủi ro | Quyết định | Rollback |
|--------|------------|----------|
| Baseline không có số đo | Dùng manual smoke + queue list | Re-measure sau gateway scale |
| Replica env lệch file vs deploy | Single `.env` + stack deploy | Restore env backup |
