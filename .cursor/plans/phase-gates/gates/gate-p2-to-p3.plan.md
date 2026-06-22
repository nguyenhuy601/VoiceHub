---
name: gate-p2-to-p3
overview: Gate G2 — Phase 2 done + bug rà soát trước Phase 3 (edge prod / Cloudflare prep).
todos:
  - id: p2-plans-complete
    content: Tick phase-2 master index (prep→validation)
    status: completed
  - id: scale-verify
    content: Gateway 2+ replica stable; workers policy tested
    status: completed
  - id: p2-load-pass
    content: p2-scale-load-validation pass
    status: completed
  - id: scale-bug-triage
    content: Không P0 scale/regression (5xx spike, socket split)
    status: completed
  - id: gate-doc-signoff
    content: Ghi docs/phase-gate-*-g2.md + approve Phase 3+
    status: completed
isProject: false
---

# Gate G2 — Phase 2 → Phase 3+

**Chạy trước:** Plan Phase 3 edge prod / Cloudflare (folder riêng khi tạo)  
**Sau PASS:** Phase 3 TLS prod polish, Phase 5 Cloudflare prep  
**Tiêu chí:** Cổng ra khỏi stateless scale staging

## 1. Mục tiêu & phạm vi

### Done (PASS)
- Phase 2 plans completed
- Gateway ≥2 replica ổn định 24h
- Load validation pass; Phase 1 infra không regress
- Edge staging smoke (nếu p2-nginx done)

### In-scope
- [Phase 2 master index](../phase-2-stateless-scale/00-master-index.plan.md)
- [`p2-scale-load-validation`](../phase-2-stateless-scale/validation/p2-scale-load-validation.plan.md)
- [`realtime-ha-checklist.md`](../../../devops/swarm/realtime-ha-checklist.md) (gateway scale context)

### Out-of-scope
- Production Cloudflare cutover
- K8s

## 2. Files affected

| Chạy / tạo | Verify |
|------------|--------|
| `devops/swarm/run-p2-scale-validation.sh` | Tạo khi implement P2 validation |
| `docs/ha-baseline-staging-phase2-*.md` | Baseline |
| `docs/phase-gate-YYYY-MM-DD-g2.md` | Sign-off |
| `devops/nginx/verify-lan-https.ps1` | Nếu edge plan done |

## 3. Thiết kế & trách nhiệm

### A. Plan completion matrix (Phase 2)

| Plan | Pass khi |
|------|----------|
| p2-prep-replica-baseline | Inventory + load baseline |
| p2-gateway-scale | `API_GATEWAY_REPLICAS>=2` |
| p2-worker-replicas-autoscale | Policy tested |
| p2-voice-udp-strategy | Doc + 2-user smoke |
| p2-nginx-staging-edge | HTTPS LAN (hoặc WAIVE) |
| p2-prometheus-metrics | Queue depth observable |
| p2-scale-load-validation | Combined load pass |

### B. Bug triage

| P0 | P1 |
|----|-----|
| Gateway scale → 5xx >5m | BFF cache cold start |
| Socket desync multi replica | Worker scale lag |
| Phase 1 Redis/Rabbit regress | Voice UDP doc-only gap |

### C. Phase 1 regression subset

Quick check: 1 Redis failover, 1 Rabbit node kill, Atlas ping — không full chaos lại trừ khi regress nghi ngờ.

## 4. Thứ tự triển khai

1. Phase 2 master todos audit
2. 24h stability window (no restart loop)
3. Run P2 validation script/checklist
4. Phase 1 regression subset
5. Bug triage
6. Gate doc + tag `phase-gate-g2-pass-YYYY-MM-DD`
7. Approve Phase 3 planning/implementation

## 5. Test plan

```bash
docker stack services voicehub
docker service ps voicehub_api-gateway
bash devops/swarm/load-chaos-validation.md   # checklist
bash devops/swarm/realtime-ha-checklist.md
curl -sS http://localhost:3000/health
```

- Login storm (10 user)
- DM 2 browser + kill 1 gateway task
- Queue burst → drain

## 6. Risk & trade-off

| Rủi ro | Quyết định | Rollback |
|--------|------------|----------|
| Scale before observability | Gate requires metrics baseline | `API_GATEWAY_REPLICAS=1` |
| Edge optional skipped | WAIVE nginx; block public prod edge | Complete p2-nginx first |

## Sign-off

- [ ] Phase 2 plans done / waived
- [ ] Gateway scale stable
- [ ] Load validation pass
- [ ] Phase 1 no regress
- [ ] **APPROVED for Phase 3+ / public edge**
