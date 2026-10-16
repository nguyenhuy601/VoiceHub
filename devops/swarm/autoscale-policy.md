# Autoscale Policy (b5)

## CPU-bound workers
Applies to workers có CPU cao khi xử lý job (ví dụ `report-etl-worker`, worker AI Project khi bật).

Scale out when:
- CPU > 70% for 5 minutes OR queue depth > 100.

Scale in when:
- CPU < 35% and queue depth < 20 for 15 minutes.

> **Đã gỡ:** `ai-task-extract-worker` / `ai-task-sync-worker` — không còn trong stack.

## IO-bound workers
Applies to:
- `notification-dispatch-worker`

Scale out when:
- queue depth > 200 OR retry rate > 5%.

Scale in when:
- queue depth < 30 for 20 minutes.

## DB-bound worker/API mix
Applies to:
- `project-worker`
- `chat-service` (if background jobs added)

Scale cautiously:
- max +1 replica every 10 minutes,
- monitor DB connection and lock contention before next increment.

## Guardrails
- Keep min replicas:
  - project-worker: 1
  - notification-dispatch-worker: 1
- Define hard max per node capacity.
