# VoiceHub Swarm Operations

> **Script còn lại:** [OPERATIONS.md](./OPERATIONS.md) — build, deploy, scale, CF lockdown.  
> Script verify theo phase (`run-p*.sh`, …) đã gỡ; dùng checklist trong `docs/` + smoke thủ công trong OPERATIONS.

## Files chính

| File | Mô tả |
|------|-------|
| [OPERATIONS.md](./OPERATIONS.md) | Danh mục script vận hành + smoke thủ công |
| [ha-infra-roadmap.md](./ha-infra-roadmap.md) | Roadmap Phase 0–5 |
| [staging-nginx-edge.md](./staging-nginx-edge.md) | Nginx TLS dev / prod-edge |
| [voice-staging-smoke.md](./voice-staging-smoke.md) | Voice smoke checklist |
| [realtime-ha-checklist.md](./realtime-ha-checklist.md) | Socket / DM checklist |
| [phase2-workers-autoscale-runbook.md](./phase2-workers-autoscale-runbook.md) | Scale workers |
| [p1-atlas-migration-runbook.md](./p1-atlas-migration-runbook.md) | Atlas cutover |
| [observability-baseline.md](./observability-baseline.md) | Monitoring baseline |
| [rollback-runbook.md](./rollback-runbook.md) | `docker service update --rollback` |
| [stack-audit.md](./stack-audit.md) | Checklist audit Swarm |

## Quick start

1. `bash devops/scripts/rotate-staging-secrets.sh --apply`
2. `VOICEHUB_ENV_CHECK=staging bash devops/scripts/check-security-env.sh`
3. `bash devops/swarm/build-local-images.sh`
4. `bash devops/swarm/node-labels.sh`
5. `bash devops/swarm/deploy-stack.sh`
6. Smoke: xem [OPERATIONS.md § Smoke thủ công](./OPERATIONS.md#smoke-thủ-công)

## Production cutover

[production-cutover-voicehub-guide.md](../../.cursor/plans/docs/production-cutover-voicehub-guide.md)
