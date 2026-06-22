# Load + Chaos Validation (S3 / b6)

## Automated scripts

```bash
# P2 sign-off (gateway 2+ + workers scaled)
bash devops/swarm/run-p2-scale-validation.sh

# Toàn bộ S3 (config + chaos + load)
bash devops/swarm/run-s3-validation.sh

# Từng phần
bash devops/swarm/run-chaos-redis-rabbit.sh   # restart Redis/Rabbit, queue drain
CHAOS_DRY_RUN=1 bash devops/swarm/run-chaos-redis-rabbit.sh  # chỉ đo queue, không restart
bash devops/swarm/run-load-smoke.sh           # gateway burst + /socket.io probe
```

## Load scenarios
1. Burst chat messages in organization channels.
2. Upload batch files to trigger `task-file-worker`.
3. Push AI extraction and sync jobs continuously.
4. Trigger webhook bursts for friend/task events.
5. Keep 2-10 concurrent voice rooms.

## Chaos scenarios
1. Kill one worker replica (`docker service update --force`).
2. Restart Redis.
3. Restart RabbitMQ.
4. Drain node labeled `ai=true`.

## Pass criteria
- No message loss (DLQ only for exhausted retries).
- Queue backlog drains after failure recovery.
- Realtime reconnects successfully.
- Voice rooms new join still succeeds.
- Rollback command works for each changed service.
