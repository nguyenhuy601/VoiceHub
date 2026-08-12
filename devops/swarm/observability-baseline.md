# Observability Baseline (a8)

## Metrics to collect
- Service health: desired vs running tasks per service.
- Container restarts and `OOMKilled`.
- Queue depth:
  - `voicehub.friend.dm`
  - `task-ai.extract`
  - `task-ai.sync`
  - `voicehub.task.from_file`
  - `voicehub.notification.dispatch`
  - `voicehub.webhook.delivery`
- API latency p95 on gateway.
- Socket reconnect rate and disconnect reasons.

**P2-Obs:** [`docs/phase2-observability-staging.md`](../../docs/phase2-observability-staging.md)  
**P4-Obs:** [`docs/phase4-oncall-runbook.md`](../../docs/phase4-oncall-runbook.md) · [`observability/alerts.yml`](./observability/alerts.yml)

## Commands (quick baseline)

```bash
docker stack services voicehub
docker stack ps voicehub --no-trunc
bash devops/scripts/rabbit-queue-depth.sh
bash devops/swarm/observability/export-swarm-metrics.sh
docker service logs -f voicehub_socket-service
docker service logs -f voicehub_ai-task-extract-worker
docker service logs -f voicehub_project-worker
```

Deploy stack observability (khi cần):

```bash
bash devops/swarm/observability/deploy-observability-stack.sh
```

## Success threshold
- No service restart loop.
- Queue depth returns to near zero under nominal load.
- No consistent `OOMKilled`.
- p95 latency stable vs pre-cutover (+/- 20%).
