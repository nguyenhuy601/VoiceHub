# P2-Workers — Manual autoscale runbook (Swarm)

**Policy:** [`autoscale-policy.md`](./autoscale-policy.md)  
**Scale:** `docker service scale` (helper `scale-workers.sh` đã gỡ)

## Guardrails (staging single-node)

| Worker | Min | Staging max | Placement |
|--------|-----|-------------|-----------|
| project-worker | 1 | 2–3 | any |
| notification-dispatch-worker | 1 | 2–3 | IO-bound |
| ai-task-extract-worker | 1 | 2 | `node.labels.ai == true` |
| ai-task-sync-worker | 1 | 2 | `node.labels.ai == true` |

## Scale out

```bash
# Root .env (ví dụ)
TASK_WORKER_REPLICAS=2
NOTIFICATION_DISPATCH_WORKER_REPLICAS=2

bash devops/swarm/deploy-stack.sh
# hoặc nhanh:
docker service scale voicehub_project-worker=2 voicehub_notification-dispatch-worker=2
```

## Scale in

```bash
docker service scale voicehub_project-worker=1 voicehub_notification-dispatch-worker=1
```

## Verify

```bash
docker service ls --filter name=voicehub_ | grep -E 'worker|Worker'
# Queue depth: Rabbit management UI / rabbitmqctl
```
