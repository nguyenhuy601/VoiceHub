# Domain Worker Candidates (b4)

## Priority 1 (implemented)
- `project-worker`
- `notification-dispatch-worker`
- `report-etl-worker` (khi bật trong stack)

> **Đã gỡ:** `ai-task-extract-worker` / `ai-task-sync-worker`.

## Priority 2 (evaluate by metrics)
- `chat-media-worker`
  - Trigger when chat file processing increases p95 API latency.
- `presence-sync-worker`
  - Trigger when presence writes cause high DB write contention.

## Decision signals
- API p95 regression > 25%.
- Event loop lag > 100ms sustained.
- Queue backlog repeatedly grows during business peak.
