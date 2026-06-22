---
name: p1-rabbit-cluster-stack
overview: P1-Rabbit-A — RabbitMQ 3-node cluster trên Swarm; management nội bộ; RABBITMQ_URL entry point.
todos:
  - id: rabbit-cluster-stack
    content: devops/swarm/rabbitmq-cluster/ — 3 node, Erlang cookie, hostname
    status: completed
  - id: rabbit-amqp-entry
    content: Document RABBITMQ_URL cluster entry + client reconnect
    status: completed
  - id: management-internal
    content: Management UI không public; auth bắt buộc
    status: completed
  - id: cluster-node-kill-test
    content: Kill 1 node — cluster healthy, publishers reconnect
    status: completed
isProject: false
---

# P1-Rabbit-A — Cluster Stack

**Phụ thuộc:** [foundation/p1-prep-backup-inventory.plan.md](../foundation/p1-prep-backup-inventory.plan.md)  
**Tiếp theo:** [p1-rabbit-quorum-queues.plan.md](p1-rabbit-quorum-queues.plan.md)  
**Tiêu chí:** Stateful HA — Rabbit infra

## 1. Mục tiêu & phạm vi

### Done
- RabbitMQ cluster 3 node trên overlay network
- `RABBITMQ_URL` trỏ entry AMQP (node hoặc internal LB)
- Kill 1 node — cluster `running_nodes` OK
- Management chỉ nội bộ/VPN

### In-scope
- `devops/swarm/rabbitmq-cluster/` stack mới
- [`docker-stack.yml`](../../../docker-stack.yml) — thay service `rabbitmq` single (cutover)
- Staging `.env` `RABBITMQ_URL`, `RABBITMQ_USER`, `RABBITMQ_PASS`

### Out-of-scope
- Quorum queue migration (plan tiếp theo)
- Managed CloudAMQP

## 2. Files affected

| Tạo | Sửa (cutover) |
|-----|---------------|
| `devops/swarm/rabbitmq-cluster/docker-compose.cluster.yml` | `docker-stack.yml` |
| `devops/swarm/rabbitmq-cluster/README.md` | `.env` RABBITMQ_URL |

## 3. Thiết kế & trách nhiệm

```text
rabbitmq-1 (seed) ← rabbitmq-2, rabbitmq-3 join
RABBITMQ_ERLANG_COOKIE đồng bộ
hostname cố định per service
```

| Client | Hành vi |
|--------|---------|
| Publishers | `amqplib.connect` — reconnect on error |
| Consumers | `conn.on('error')` → restart consumer loop |

Rà workers: [`friendDmConsumer.js`](../../../services/chat-service/src/workers/friendDmConsumer.js), [`notificationDispatch.worker.js`](../../../services/notification-service/src/workers/notificationDispatch.worker.js), task/webhook workers.

## 4. Thứ tự triển khai

1. Deploy rabbitmq-1 với persistent volume
2. Deploy rabbitmq-2,3 — `rabbitmqctl join_cluster`
3. Verify `rabbitmqctl cluster_status`
4. Cập nhật `RABBITMQ_URL=amqp://user:pass@rabbitmq-1:5672` (hoặc DNS round-robin)
5. Rolling redeploy publishers/consumers
6. Kill node-2 — verify cluster + app publish

## 5. Test plan

- Management UI: 3 nodes visible (nội bộ)
- DM qua queue classic (trước quorum plan) — deliver OK
- Notification worker consume OK
- Node kill — no permanent connection hang (restart worker nếu cần)

## 6. Risk & trade-off

| Rủi ro | Quyết định | Rollback |
|--------|------------|----------|
| Cookie mismatch cluster fail | Secret cookie trong `.env` only | Redeploy single rabbitmq |
| amqplib no auto-reconnect | Minimal reconnect wrapper workers (quorum plan) | `docker service update --force` worker |
