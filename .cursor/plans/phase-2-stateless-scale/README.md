# Phase 2 Stateless Scale — VoiceHub

Lộ trình **Phase 2 hạ tầng (0–5)** sau [Phase 1 sign-off](../phase-1-stateful-ha/00-master-index.plan.md).

**Tiền đề:** Stateful HA (Atlas + Redis Sentinel + Rabbit quorum) đã cutover và validation pass.

## Bắt đầu tại

**[00-master-index.plan.md](./00-master-index.plan.md)**

## Cấu trúc

| Thư mục | Plan | Trọng tâm |
|---------|------|-----------|
| `foundation/` | p2-prep-replica-baseline | Inventory replica + load baseline |
| `gateway/` | p2-gateway-scale | API Gateway 2+ replica, BFF stateless |
| `workers/` | p2-worker-replicas-autoscale | Queue workers scale theo policy |
| `voice/` | p2-voice-udp-strategy | Voice UDP/host mode trên Swarm |
| `edge/` | p2-nginx-staging-edge | Nginx TLS edge staging |
| `observability/` | p2-prometheus-metrics | Metrics + queue depth alerts |
| `validation/` | p2-scale-load-validation | Load/chaos sign-off Phase 2 |

## Thứ tự

```
prep → gateway scale → workers → voice strategy → edge (optional) → observability → validation
```

Socket HA (2 replica + Redis adapter) đã làm ở stabilization S3 — Phase 2 chỉ **verify**, không plan riêng trừ khi regression.
