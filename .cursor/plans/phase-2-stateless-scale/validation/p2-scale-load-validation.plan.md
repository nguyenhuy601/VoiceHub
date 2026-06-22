---
name: p2-scale-load-validation
overview: P2-Validation — Load + chaos với stack scaled; sign-off Phase 2.
todos:
  - id: combined-load-smoke
    content: load-chaos-validation.md với gateway 2+ + workers scaled
    status: completed
  - id: socket-gateway-ha
    content: Realtime HA checklist với gateway scale
    status: completed
  - id: phase2-baseline-doc
    content: docs/ha-baseline-staging-phase2-YYYY-MM.md
    status: completed
  - id: roadmap-tick
    content: Tick ha-infra-roadmap Phase 2 scale items
    status: completed
isProject: false
---

# P2-Validation — Scale & Load Sign-off

**Phụ thuộc:** Tất cả plan Phase 2 trước validation  
**Tiếp theo:** Phase 3 edge prod / Phase 4–5 (plan folder riêng)  
**Tiêu chí:** Sign-off Phase 2

## 1. Mục tiêu & phạm vi

### Done
- [`load-chaos-validation.md`](../../../devops/swarm/load-chaos-validation.md) pass với replica đã scale
- [`realtime-ha-checklist.md`](../../../devops/swarm/realtime-ha-checklist.md) pass (gateway 2+ không regress socket)
- `docs/ha-baseline-staging-phase2-*.md` tồn tại

### In-scope
- Gateway 2+, socket 2+, workers theo policy
- Redis Sentinel + Rabbit cluster vẫn healthy (Phase 1 regression)

### Out-of-scope
- Production go-live
- Cloudflare

## 2. Files affected

| Tạo | Cập nhật |
|-----|----------|
| `docs/ha-baseline-staging-phase2-YYYY-MM.md` | `ARCHITECTURE.md` scale section |
| `devops/swarm/run-p2-scale-validation.sh` | `ha-infra-roadmap.md` |

## 3. Thiết kế & trách nhiệm

**Validation matrix:**

| Layer | Test |
|-------|------|
| Gateway | Login storm 10 user; BFF cache |
| Socket | 2 replica + DM; kill 1 socket task |
| Workers | Queue burst drain |
| Voice | 2-user call |
| Edge | HTTPS LAN smoke (nếu edge plan done) |
| Stateful regression | Redis failover quick; Rabbit 1 node kill |

## 4. Thứ tự triển khai

1. Confirm Phase 1 validation still green
2. Run load-chaos script/checklist
3. Kill 1 gateway task — no 5xx spike >5m
4. Ghi baseline doc
5. Master index Phase 2 todos → completed

## 5. Test plan

```bash
bash devops/swarm/run-p2-scale-validation.sh   # tạo khi implement
docker stack services voicehub
```

- p95 latency ±20% vs P2-0 baseline
- Queue depth → 0 sau chaos window
- `check-security-env.sh` pass

## 6. Risk & trade-off

| Rủi ro | Quyết định | Rollback |
|--------|------------|----------|
| Flaky load test | 2 lần pass cách 24h | Giảm replica tạm |
| Phase 1 regression | Chạy P1 failover subset trước | Rollback replica env |

## Sign-off checklist

- [ ] Gateway ≥2 replica stable 24h
- [ ] Workers scale policy documented + tested
- [ ] Voice strategy documented
- [ ] Observability baseline có số đo
- [ ] **Gate G2** pass — [gate-p2-to-p3](../../phase-gates/gates/gate-p2-to-p3.plan.md)
- [ ] Ready for Phase 3/4 (edge prod / CF)
