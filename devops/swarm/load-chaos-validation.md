# Load + Chaos Validation (S3 / b6)

> Script automated phase (`run-s3-validation.sh`, `run-chaos-*`, `run-load-smoke.sh`) đã gỡ sau sign-off.  
> Thực hiện thủ công theo checklist dưới.

## Smoke nhanh

```bash
docker stack services voicehub
curl -sf http://127.0.0.1:3000/health
bash devops/scripts/rabbit-queue-depth.sh
```

## Load scenarios
1. Burst chat messages in organization channels.
2. Upload batch files to trigger `task-file-worker`.
3. Push AI extraction and sync jobs continuously.
4. Trigger webhook bursts for friend/task events.
5. Keep 2-10 concurrent voice rooms.

## Chaos scenarios
1. Kill one worker replica (`docker service update --force voicehub_<worker>`).
2. Restart Redis: `docker service update --force voicehub_redis-master` (hoặc stack sentinel).
3. Restart RabbitMQ: `docker service update --force voicehub_rabbitmq-1`.
4. Drain node labeled `ai=true`.

Sau mỗi chaos: `bash devops/scripts/rabbit-queue-depth.sh` — depth về ~0.

## Pass criteria
- No message loss (DLQ only for exhausted retries).
- Queue backlog drains after failure recovery.
- Realtime reconnects successfully — [realtime-ha-checklist.md](./realtime-ha-checklist.md).
- Voice rooms new join still succeeds — [voice-staging-smoke.md](./voice-staging-smoke.md).
- Rollback command works for each changed service — [rollback-runbook.md](./rollback-runbook.md).
