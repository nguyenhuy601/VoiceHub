# Phase 1 Stateful HA — VoiceHub

Lộ trình **Phase 1 hạ tầng (0–5)** sau [stabilization sign-off](../stabilization/00-master-index.plan.md).

**Mô hình hybrid:** MongoDB Atlas (managed RS) + Redis Sentinel + RabbitMQ cluster (self-hosted Swarm).

## Bắt đầu tại

**[00-master-index.plan.md](./00-master-index.plan.md)**

## Cấu trúc

| Thư mục | Plans | Hạ tầng |
|---------|-------|---------|
| `foundation/` | p1-prep-backup-inventory | Nền |
| `mongodb/` | p1-atlas-migration | Atlas RS |
| `redis/` | sentinel-stack, client-cutover | Sentinel |
| `rabbitmq/` | cluster-stack, quorum-queues | Cluster + quorum |
| `cutover/` | p1-swarm-stack-cutover | Gộp stack |
| `validation/` | p1-failover-validation | Sign-off |

## Thứ tự

```
prep → Atlas → Redis stack → Redis client → Rabbit cluster → quorum → cutover → validation
```

Mỗi `.plan.md` có đủ 6 phần chuẩn workspace.
