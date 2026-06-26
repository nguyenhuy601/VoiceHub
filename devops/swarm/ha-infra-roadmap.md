# HA Infra Roadmap (b7)

## Phase 1 — Stateful HA (staging) ✅

**Status:** Sign-off 2026-06 — xem [`docs/ha-baseline-staging-2026-06.md`](../../docs/ha-baseline-staging-2026-06.md)  
**Gate G1 PASS:** [`docs/phase-gate-2026-06-19-g1.md`](../../docs/phase-gate-2026-06-19-g1.md)

- MongoDB Atlas (`mongodb+srv://`) — không còn single-node `mongodb` trong cutover stack
- Redis Sentinel stack `voicehub-redis` (master + 2 replica + 3 sentinel)
- RabbitMQ 3-node cluster `voicehub-rabbit` + quorum queues
- Validation (sign-off 2026-06): checklist [ha-baseline-staging-2026-06.md](../../docs/ha-baseline-staging-2026-06.md) · smoke [OPERATIONS.md](./OPERATIONS.md#smoke-thủ-công)

**Rollback Plan A:** [`phase1-rollback.md`](./phase1-rollback.md) + `docker-stack.plan-a.yml`

## Phase 2 — Scale & edge ✅

**Status:** Sign-off 2026-06-22 — [`docs/ha-baseline-staging-phase2-2026-06.md`](../../docs/ha-baseline-staging-phase2-2026-06.md)  
**Gate G1 PASS:** [`docs/phase-gate-2026-06-19-g1.md`](../../docs/phase-gate-2026-06-19-g1.md)  
**Gate G2 PASS:** [`docs/phase-gate-2026-06-22-g2.md`](../../docs/phase-gate-2026-06-22-g2.md)  
**Validation (sign-off 2026-06-22):** [ha-baseline-staging-phase2-2026-06.md](../../docs/ha-baseline-staging-phase2-2026-06.md) · [phase-gate-2026-06-22-g2.md](../../docs/phase-gate-2026-06-22-g2.md)

- Gateway `API_GATEWAY_REPLICAS=2`; socket `2/2`; workers manual scale ([`scale-workers.sh`](./scale-workers.sh))
- Voice UDP strategy documented; Nginx TLS staging ([`lan-https-voicehub.local.md`](../../docs/lan-https-voicehub.local.md))
- Observability baseline ([`phase2-observability-staging.md`](../../docs/phase2-observability-staging.md))
- **Next:** [Phase 3 edge prod-like](../../.cursor/plans/phase-3-edge-prod/00-master-index.plan.md) — sau Gate G2 PASS

**P2-0 prep:** [`docs/phase2-replica-inventory-staging.md`](../../docs/phase2-replica-inventory-staging.md) · [`phase2-prep-runbook.md`](./phase2-prep-runbook.md)  
**P2-Workers:** [`phase2-workers-autoscale-runbook.md`](./phase2-workers-autoscale-runbook.md) · [`scale-workers.sh`](./scale-workers.sh)  
**P2-Voice:** [`voice-swarm-scale-strategy.md`](../../docs/voice-swarm-scale-strategy.md) · [`voice-staging-smoke.md`](./voice-staging-smoke.md)  
**P2-Edge:** [`lan-https-voicehub.local.md`](../../docs/lan-https-voicehub.local.md) · [`staging-nginx-edge.md`](./staging-nginx-edge.md)  
**P2-Obs:** [`phase2-observability-staging.md`](../../docs/phase2-observability-staging.md) · [`observability-baseline.md`](./observability-baseline.md)

**Plans:** [`.cursor/plans/phase-2-stateless-scale/`](../../.cursor/plans/phase-2-stateless-scale/00-master-index.plan.md)

## Phase 3 — Managed stateful (ha-infra) → roadmap Phase 4

**Plans:** [`.cursor/plans/phase-4-prod-scale/stateful/`](../../.cursor/plans/phase-4-prod-scale/stateful/p4-managed-redis-migration.plan.md) (Redis rồi Rabbit — một component/lần)

- Move Redis/Rabbit to managed platform when ready
- Keep Swarm for stateless workloads and workers
- Rollback: redeploy `voicehub-redis` / `voicehub-rabbit` stacks — xem [phase1-rollback.md](./phase1-rollback.md)

## Phase 3–5 (stabilization roadmap 0–5)

> **Môi trường hiện tại:** 1 máy dev — đọc [`docs/single-node-dev-profile.md`](../../docs/single-node-dev-profile.md). Replica/Redis/Rabbit **không bump** so với cap máy.

| Phase | Nội dung | Plans |
|-------|----------|-------|
| **3** | Edge prod-like staging | [phase-3-edge-prod](../../.cursor/plans/phase-3-edge-prod/00-master-index.plan.md) |
| **4** | Runbook + obs + DR trên cap 1-node; managed/scale **defer** | [phase-4-prod-scale](../../.cursor/plans/phase-4-prod-scale/00-master-index.plan.md) |

**P4-Voice:** [`voice-swarm-scale-strategy.md`](../../docs/voice-swarm-scale-strategy.md) · **WAIVE** multi-node trên 1-node · [`voice-staging-smoke.md`](./voice-staging-smoke.md)

**P4-Obs:** [`phase4-oncall-runbook.md`](../../docs/phase4-oncall-runbook.md) · [`observability-baseline.md`](./observability-baseline.md) · [`observability/alerts.yml`](./observability/alerts.yml)
| **5** | Cloudflare — origin 1 node OK | [phase-5-cloudflare-edge](../../.cursor/plans/phase-5-cloudflare-edge/00-master-index.plan.md) |

**P5-Cloudflare:** [ha-baseline-production-phase5-2026-06.md](../../docs/ha-baseline-production-phase5-2026-06.md) · [phase5-e2e-internet-checklist.md](../../docs/phase5-e2e-internet-checklist.md) · [phase5-cloudflare-cutover-runbook.md](../../docs/phase5-cloudflare-cutover-runbook.md) · [OPERATIONS.md](./OPERATIONS.md#smoke-thủ-công)

**Status Phase 5:** ✅ **Validation PASS with conditions** (2026-06-26) — [G5 gate](../../docs/phase-gate-2026-06-26-g5.md). Doc + automated verify complete trên 1-node; public E2E + apex cutover **DEFER** khi có domain/VPS.

**Phase 0–5 roadmap:** **complete** (infrastructure doc + verify on single-node dev profile).

**Production cutover (domain + CF thật):** [.cursor/plans/docs/production-cutover-voicehub-guide.md](../../.cursor/plans/docs/production-cutover-voicehub-guide.md)

**Gates:** G3 [gate-p3-to-p4](../../.cursor/plans/phase-gates/gates/gate-p3-to-p4.plan.md) · G4 [gate-p4-to-p5](../../.cursor/plans/phase-gates/gates/gate-p4-to-p5.plan.md) — **PASS 2026-06-26** ([G4](../../docs/phase-gate-2026-06-26-g4.md)) · **G5** [p5-validation](../../docs/phase-gate-2026-06-26-g5.md) — **PASS with conditions 2026-06-26**

## Migration principle

- Migrate one infra component at a time.
- Keep compatibility via service DNS names.
- Validate with canary and rollback checkpoints.
