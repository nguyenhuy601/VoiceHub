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

**P2-Obs:** [`docs/phase2-observability-staging.md`](../../docs/phase2-observability-staging.md) · `run-p2-observability-baseline.sh`

## Commands (quick baseline)
- `docker stack services voicehub`
- `docker stack ps voicehub --no-trunc`
- `bash devops/scripts/rabbit-queue-depth.sh`
- `bash devops/swarm/run-p2-observability-baseline.sh`
- `docker service logs -f voicehub_socket-service`
- `docker service logs -f voicehub_ai-task-extract-worker`
- `docker service logs -f voicehub_task-worker`

## Success threshold
- No service restart loop.
- Queue depth returns to near zero under nominal load.
- No consistent `OOMKilled`.
- p95 latency stable vs pre-cutover (+/- 20%).
