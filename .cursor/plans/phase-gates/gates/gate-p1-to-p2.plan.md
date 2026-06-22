---
name: gate-p1-to-p2
overview: Gate G1 — Phase 1 done + bug rà soát trước khi bắt Phase 2 (Stateless scale).
todos:
  - id: p1-plans-complete
    content: Tick phase-1 master index (prep→validation)
    status: completed
  - id: cutover-verify
    content: docker stack không mongodb/redis/rabbit single; HA stacks up
    status: completed
  - id: p1-failover-pass
    content: p1-failover-validation + load-chaos pass
    status: completed
  - id: infra-bug-triage
    content: Không P0 Atlas/Redis/Rabbit reconnect
    status: completed
  - id: gate-doc-signoff
    content: Ghi docs/phase-gate-*-g1.md + approve Phase 2
    status: completed
isProject: false
---

# Gate G1 — Phase 1 → Phase 2

**Chạy trước:** [p2-prep-replica-baseline](../phase-2-stateless-scale/foundation/p2-prep-replica-baseline.plan.md)  
**Sau PASS:** Bắt đầu [phase-2-stateless-scale](../phase-2-stateless-scale/00-master-index.plan.md)  
**Tiêu chí:** Cổng vào Stateless scale

## 1. Mục tiêu & phạm vi

### Done (PASS)
- Mọi plan Phase 1 completed (hoặc waived có ticket)
- Cutover deploy thành công trên staging
- Failover validation pass
- Không P0 infra (Mongo/Redis/Rabbit/DM queue)

### In-scope
- [Phase 1 master index](../phase-1-stateful-ha/00-master-index.plan.md) todos
- [`p1-failover-validation`](../phase-1-stateful-ha/validation/p1-failover-validation.plan.md)
- [`deploy-phase1-cutover.sh`](../../../devops/swarm/deploy-phase1-cutover.sh)
- `tests/p1-*.smoke.js`

### Out-of-scope
- Gateway 2 replica (Phase 2)
- Cloudflare

## 2. Files affected

| Chạy / tạo | Verify |
|------------|--------|
| `tests/p1-atlas-migration.smoke.js` | URI audit |
| `tests/p1-rabbit-quorum.smoke.js` | Quorum helpers |
| `tests/p1-swarm-cutover.smoke.js` | Stack compose |
| `tests/p1-redis-client-cutover.smoke.js` | Sentinel client |
| `devops/swarm/run-p1-failover-validation.sh` | Nếu có |
| `docs/phase-gate-YYYY-MM-DD-g1.md` | Sign-off record |

## 3. Thiết kế & trách nhiệm

### A. Plan completion matrix (Phase 1)

| Plan | Pass khi |
|------|----------|
| p1-prep-backup-inventory | Backup + inventory doc |
| p1-atlas-migration | `mongodb+srv` mọi service |
| p1-redis-sentinel-stack | `voicehub-redis` 6 tasks |
| p1-redis-client-cutover | `REDIS_SENTINELS` client OK |
| p1-rabbit-cluster-stack | `voicehub-rabbit` 3 nodes |
| p1-rabbit-quorum-queues | assertQuorum + reconnect |
| p1-swarm-stack-cutover | No single stateful in main stack |
| p1-failover-validation | Chaos + ha-baseline doc |

### B. Runtime verify (staging)

```bash
docker stack services voicehub | grep -E 'mongodb|redis|rabbitmq'   # expect empty
docker stack services voicehub-redis
docker stack services voicehub-rabbit
docker stack ps voicehub --filter desired-state=running
```

### C. Bug triage (Phase 1 scope)

| P0 (FAIL) | P1 (conditional PASS) |
|-----------|------------------------|
| Atlas connect fail all services | Single service intermittent |
| Redis Sentinel no failover | BFF cache miss spike |
| Rabbit quorum declare fail | DLQ depth slow drain |
| DM mất message sau node kill | |
| `dm:corr` duplicate message | |

Functional smoke: login, DM qua queue, notification dispatch, task-from-file job.

## 4. Thứ tự triển khai

1. Audit Phase 1 master todos — all completed?
2. Confirm cutover script finished 4 steps (app + redis + rabbit + rolling)
3. Chạy P1 smoke suite + failover validation
4. Manual smoke: DM, notification, 2 browser socket
5. Bug triage — block P0
6. Ghi gate doc; tag `phase-gate-g1-pass-YYYY-MM-DD`
7. **Mới** implement `p2-prep`

## 5. Test plan

```bash
node tests/p1-atlas-migration.smoke.js
node tests/p1-redis-client-cutover.smoke.js
node tests/p1-rabbit-quorum.smoke.js
node tests/p1-swarm-cutover.smoke.js
VOICEHUB_ENV_CHECK=staging bash devops/scripts/check-security-env.sh
# Failover (staging Swarm):
bash devops/swarm/run-p1-failover-validation.sh   # khi có
bash devops/swarm/load-chaos-validation.md          # checklist thủ công
```

Login + DM + notification trên staging URL.

## 6. Risk & trade-off

| Rủi ro | Quyết định | Rollback |
|--------|------------|----------|
| Cutover script fail nhưng code merged | Gate FAIL — không Phase 2 | [`phase1-rollback.md`](../../../devops/swarm/phase1-rollback.md) |
| Validation skip vì thiếu 3-node Swarm | WAIVE có doc + single-node limits | Phase 2 prep only local |

## Sign-off

- [ ] Phase 1 all plans done / waived
- [ ] Cutover + HA stacks running
- [ ] Failover validation pass
- [ ] No P0 infra bugs
- [ ] **APPROVED to start Phase 2**
