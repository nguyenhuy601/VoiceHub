---
name: p1-failover-validation
overview: P1-Validation — Failover chaos từng layer + combined smoke; ghi ha-baseline; sign-off Phase 1.
todos:
  - id: atlas-failover
    content: Atlas primary step-down — app reconnect smoke
    status: completed
  - id: redis-failover
    content: Sentinel failover + realtime HA checklist
    status: completed
  - id: rabbit-failover
    content: Kill 2/3 rabbit nodes — queue drain, no message loss
    status: completed
  - id: ha-baseline-doc
    content: Ghi docs/ha-baseline-staging-YYYY-MM.md + tick ha-infra-roadmap
    status: completed
isProject: false
---

# P1-Validation — Failover & Sign-off

**Phụ thuộc:** [cutover/p1-swarm-stack-cutover.plan.md](../cutover/p1-swarm-stack-cutover.plan.md)  
**Tiếp theo:** Phase 2 hạ tầng (scale gateway — plan folder riêng)  
**Tiêu chí:** Sign-off Phase 1

## 1. Mục tiêu & phạm vi

### Done
- Failover Atlas, Redis, Rabbit từng layer pass
- Combined load smoke pass
- `docs/ha-baseline-staging-*.md` tồn tại
- [`ha-infra-roadmap.md`](../../../devops/swarm/ha-infra-roadmap.md) Phase 2 ticked (staging)

### In-scope
- [`load-chaos-validation.md`](../../../devops/swarm/load-chaos-validation.md)
- [`realtime-ha-checklist.md`](../../../devops/swarm/realtime-ha-checklist.md)
- [`observability-baseline.md`](../../../devops/swarm/observability-baseline.md)

### Out-of-scope
- Production go-live
- Phase 2–5 edge/scale

## 2. Files affected

| Tạo | Cập nhật |
|-----|----------|
| `docs/ha-baseline-staging-YYYY-MM.md` | `ARCHITECTURE.md` (section HA) |
| | [`ha-infra-roadmap.md`](../../../devops/swarm/ha-infra-roadmap.md) |

## 3. Thiết kế & trách nhiệm

| Layer | Kịch bản |
|-------|----------|
| Atlas | Failover primary (UI) — services reconnect |
| Redis | Sentinel failover — 2 client DM + presence |
| Rabbit | Kill nodes sequential — workers drain |
| Combined | Burst DM + notification + task upload + 2 voice rooms |

**Pass criteria** (từ load-chaos):
- No message loss (DLQ only after retry exhausted)
- Queue depth → ~0 after recovery
- Realtime reconnect OK
- p95 gateway ±20% vs [`perf-baseline-staging`](../../../docs/) (stabilization S0)

## 4. Thứ tự triển khai

1. Atlas failover test — monitor service logs 5 phút
2. Redis `SENTINEL failover` — realtime checklist
3. Rabbit chaos — từng node, đo queue depth
4. Combined smoke 30–60 phút
5. Ghi metric vào `docs/ha-baseline-staging-*.md`
6. Master index Phase 1 todos → completed
7. Link Phase 2 plan (khi có)

## 5. Test plan

```bash
docker stack services voicehub
docker service logs -f voicehub_socket-service
docker service logs -f voicehub_chat-service
```

Manual:
- 2 browser DM during Redis failover
- Upload file → task worker during Rabbit chaos
- Login/logout during Atlas step-down

## 6. Risk & trade-off

| Rủi ro | Quyết định | Rollback |
|--------|------------|----------|
| Combined test làm staging unstable | Off-hours; limit concurrency | Pause test; restore checkpoint |
| Metric không có Prometheus | Manual log + queue depth commands | Bổ sung wave-0 metrics sau |

## Sign-off checklist

- [ ] Atlas — all services on `mongodb+srv://`
- [ ] Redis Sentinel failover < 30s app recovery
- [ ] Rabbit quorum — no permanent message loss
- [ ] Stack cutover — no single mongo/redis/rabbit
- [ ] ha-baseline doc written
- [ ] Ready for Phase 2 — chạy [Gate G1](../../phase-gates/gates/gate-p1-to-p2.plan.md) rồi [phase-2-stateless-scale](../../phase-2-stateless-scale/00-master-index.plan.md)
