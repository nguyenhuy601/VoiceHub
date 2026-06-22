# VoiceHub Swarm Operations

## Files
- `stack-audit.md`: checklist audit for swarm readiness.
- `env-secrets-inventory.md`: env/secrets inventory.
- `rollback-runbook.md`: per-service `docker service update --rollback` (S0).
- `internal-tokens-deploy.md`: đồng bộ `REALTIME_INTERNAL_TOKEN` / `CHAT_INTERNAL_TOKEN` (S1b).
- `webhook-service-network.md`: webhook nội bộ, không CORS public (S1+).
- `build-local-images.sh`: build `voicehub-*:latest` local (shared baked in, repo root context).
- `build-and-push.sh`: registry build/push helper.
- `deploy-stack.sh`: deploy stack command wrapper.
- `node-labels.sh`: apply node labels for placement.
- `realtime-ha-checklist.md`: sticky + Redis adapter verification.
- `run-s3-validation.sh`: S3 automated validation (HA + chaos + load smoke).
- `run-p1-failover-validation.sh`: **P1-Validation** — Atlas + Redis Sentinel + Rabbit 2/3 kill + combined smoke.
- `build-local-images.sh`: build `voicehub-*:latest` với `@enterprise/shared` baked in (context repo root).
- `staging-nginx-edge.md`: optional Nginx TLS edge + `TRUST_PROXY`.
- `cutover-runbook.md`: Plan A rollout/rollback.
- `observability-baseline.md`: monitoring baseline.
- `domain-worker-candidates.md`: Plan B candidate workers.
- `autoscale-policy.md`: scaling thresholds.
- `load-chaos-validation.md`: validation scenarios.
- `phase1-prep-runbook.md`: P1-0 backup, volume snapshot, maintenance window.
- `p1-atlas-migration-runbook.md`: P1-Mongo Atlas URI cutover + verify.
- `redis-sentinel/`: P1-Redis-A Sentinel stack + P1-Redis-B client failover chaos.
- `rabbitmq-cluster/`: P1-Rabbit-A 3-node cluster + node-kill test.
- Stabilization sign-off: [`.cursor/plans/stabilization/00-master-index.plan.md`](../../.cursor/plans/stabilization/00-master-index.plan.md) § S4c.
- `ha-infra-roadmap.md`: infra HA roadmap.
- `scale-runbook.sh`: scale command templates.

## Quick start
1. Rotate staging secrets: `bash devops/scripts/rotate-staging-secrets.sh --apply`
2. `VOICEHUB_ENV_CHECK=staging bash devops/scripts/check-security-env.sh`
3. Build/push images.
4. Label nodes.
5. Deploy stack.
4. Run canary.
5. Scale workers by queue backlog.
