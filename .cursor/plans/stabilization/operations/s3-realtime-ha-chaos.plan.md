---
name: s3-realtime-ha-chaos
overview: "S3 — Ổn định staging: socket 2 replica + Redis adapter, chaos Redis/RabbitMQ, load smoke, optional Nginx edge."
todos:
  - id: socket-ha-config
    content: SOCKET_SERVICE_REPLICAS=2, SOCKET_IO_REDIS_ADAPTER=true trên staging
    status: completed
  - id: realtime-ha-checklist
    content: Chạy devops/swarm/realtime-ha-checklist.md — pass
    status: completed
  - id: chaos-redis-rabbit
    content: Restart Redis + RabbitMQ — queue drain, DM không mất
    status: completed
  - id: load-smoke
    content: Kịch bản devops/swarm/load-chaos-validation.md — pass criteria
    status: completed
  - id: nginx-edge-optional
    content: (Tùy chọn) Nginx + swarm-socket-sticky + TRUST_PROXY=1
    status: completed
isProject: false
---

# S3 — Realtime HA & Chaos Validation

**Phụ thuộc:** [realtime/s2-socket-canonical.plan.md](../realtime/s2-socket-canonical.plan.md)  
**Tiếp theo:** [cleanup/s4-gateway-legacy.plan.md](../cleanup/s4-gateway-legacy.plan.md)  
**Tiêu chí:** Ổn định

## 1. Mục tiêu & phạm vi

### Done
- Kill 1 socket replica → client reconnect, DM/presence OK
- Restart Redis/Rabbit → recovery, queue ~0
- Load smoke: no restart loop, p95 ±20% baseline S0
- (Optional) Nginx edge staging hoạt động

### In-scope
- [`docker-stack.yml`](../../../docker-stack.yml) replicas env
- [`devops/swarm/realtime-ha-checklist.md`](../../../devops/swarm/realtime-ha-checklist.md)
- [`devops/swarm/load-chaos-validation.md`](../../../devops/swarm/load-chaos-validation.md)
- [`devops/nginx/swarm-socket-sticky.conf`](../../../devops/nginx/swarm-socket-sticky.conf)

### Out-of-scope
- Mongo RS, Redis Sentinel ([`ha-infra-roadmap.md`](../../../devops/swarm/ha-infra-roadmap.md) Phase 2)
- voice-service multi-replica
- Autoscale/HPA

## 2. Files affected

| Chỉnh | Chỉ chạy/verify |
|-------|-----------------|
| `.env` staging replicas | `realtime-ha-checklist.md` |
| `docker-stack.yml` (nếu cần) | `load-chaos-validation.md` |
| Nginx config staging (optional) | |

## 3. Thiết kế & trách nhiệm

| Thành phần | Config |
|------------|--------|
| socket-service | `replicas: 2`, Redis adapter |
| Redis | Single node Plan A — chấp nhận SPOF staging |
| RabbitMQ | Idempotency `dm:corr:*` phải giữ message khi redeliver |
| Gateway | 1 replica OK; bottleneck WS có thể tách sau ([`SOCKET_LB.md`](../../../docs/SOCKET_LB.md)) |

## 4. Thứ tự triển khai

1. Set env replicas → redeploy stack
2. **HA test:** 2 browser → `docker service update --force voicehub_socket-service` (1 task) → verify
3. **Chaos Redis:** restart container → presence reconnect
4. **Chaos Rabbit:** restart → monitor queue depth 5 queues (observability-baseline)
5. **Load:** burst chat, 2–5 voice rooms, webhook burst
6. So sánh metric với `docs/perf-baseline-staging-*.md`
7. (Optional) Nginx trước Swarm + `TRUST_PROXY=1`

## 5. Test plan

Pass criteria từ load-chaos-validation:
- No message loss (DLQ chỉ sau retry hết)
- Queue backlog drain sau recovery
- Realtime reconnect OK
- Voice new join OK
- Rollback command works

```bash
docker stack services voicehub
docker service logs -f voicehub_socket-service
```

## 6. Risk & trade-off

| Rủi ro | Quyết định | Rollback |
|--------|------------|----------|
| Redis restart mất presence tạm | Chấp nhận; client reconnect | Không scale thêm trước fix S2 |
| voice single replica SPOF | Document; không fix trong S3 | Phase sau — room state Redis |
| Load test làm staging down | Chạy off-hours; giới hạn concurrent | `docker stack deploy` previous |
