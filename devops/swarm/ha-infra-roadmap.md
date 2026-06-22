# HA Infra Roadmap (b7)

## Phase 1 — Stateful HA (staging) ✅

**Status:** Sign-off 2026-06 — xem [`docs/ha-baseline-staging-2026-06.md`](../../docs/ha-baseline-staging-2026-06.md)  
**Gate G1 PASS:** [`docs/phase-gate-2026-06-19-g1.md`](../../docs/phase-gate-2026-06-19-g1.md)

- MongoDB Atlas (`mongodb+srv://`) — không còn single-node `mongodb` trong cutover stack
- Redis Sentinel stack `voicehub-redis` (master + 2 replica + 3 sentinel)
- RabbitMQ 3-node cluster `voicehub-rabbit` + quorum queues
- Validation: `bash devops/swarm/run-p1-failover-validation.sh`

**Rollback Plan A:** [`phase1-rollback.md`](./phase1-rollback.md) + `docker-stack.plan-a.yml`

## Phase 2 — Scale & edge ✅

**Status:** Sign-off 2026-06-22 — [`docs/ha-baseline-staging-phase2-2026-06.md`](../../docs/ha-baseline-staging-phase2-2026-06.md)  
**Gate G1 PASS:** [`docs/phase-gate-2026-06-19-g1.md`](../../docs/phase-gate-2026-06-19-g1.md)  
**Gate G2 PASS:** [`docs/phase-gate-2026-06-22-g2.md`](../../docs/phase-gate-2026-06-22-g2.md)  
**Validation:** `bash devops/swarm/run-p2-scale-validation.sh` · `bash devops/swarm/run-g2-gate-validation.sh`

- Gateway `API_GATEWAY_REPLICAS=2`; socket `2/2`; workers manual scale ([`scale-workers.sh`](./scale-workers.sh))
- Voice UDP strategy documented; Nginx TLS staging ([`lan-https-voicehub.local.md`](../../docs/lan-https-voicehub.local.md))
- Observability baseline ([`phase2-observability-staging.md`](../../docs/phase2-observability-staging.md))
- **Next:** Gate G2 PASS — Phase 3 edge prod / Cloudflare prep (plan folder TBD)

**P2-0 prep:** [`docs/phase2-replica-inventory-staging.md`](../../docs/phase2-replica-inventory-staging.md) · [`phase2-prep-runbook.md`](./phase2-prep-runbook.md)  
**P2-Workers:** [`phase2-workers-autoscale-runbook.md`](./phase2-workers-autoscale-runbook.md) · [`scale-workers.sh`](./scale-workers.sh)  
**P2-Voice:** [`voice-swarm-scale-strategy.md`](../../docs/voice-swarm-scale-strategy.md) · [`voice-staging-smoke.md`](./voice-staging-smoke.md)  
**P2-Edge:** [`lan-https-voicehub.local.md`](../../docs/lan-https-voicehub.local.md) · [`run-p2-nginx-edge-smoke.sh`](./run-p2-nginx-edge-smoke.sh)  
**P2-Obs:** [`phase2-observability-staging.md`](../../docs/phase2-observability-staging.md) · [`run-p2-observability-baseline.sh`](./run-p2-observability-baseline.sh)

**Plans:** [`.cursor/plans/phase-2-stateless-scale/`](../../.cursor/plans/phase-2-stateless-scale/00-master-index.plan.md)

## Phase 3

- Move stateful infra to dedicated platform (managed DB/broker) if available.
- Keep Swarm for stateless workloads and workers.

## Migration principle

- Migrate one infra component at a time.
- Keep compatibility via service DNS names.
- Validate with canary and rollback checkpoints.
