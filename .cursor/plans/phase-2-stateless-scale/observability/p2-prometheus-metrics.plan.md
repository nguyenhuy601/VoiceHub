---
name: p2-prometheus-metrics
overview: P2-Obs — Prometheus baseline metrics queue depth, restarts, gateway latency.
todos:
  - id: metrics-stack
    content: Prometheus scrape Swarm/node hoặc script export queue depth
    status: completed
  - id: queue-depth-alerts
    content: Alert threshold theo observability-baseline
    status: completed
  - id: dashboard-doc
    content: Ghi metric list vào docs/phase2-observability-staging.md
    status: completed
isProject: false
---

# P2-Obs — Prometheus & Metrics Baseline

**Phụ thuộc:** [p2-nginx-staging-edge](../edge/p2-nginx-staging-edge.plan.md) (có thể song song gateway scale)  
**Tiếp theo:** [validation/p2-scale-load-validation.plan.md](../validation/p2-scale-load-validation.plan.md)  
**Tiêu chí:** Observability wave-0 backlog

## 1. Mục tiêu & phạm vi

### Done
- Queue depth observable (Rabbit management hoặc script cron)
- Service restart / OOM tracked
- Gateway latency p95 baseline post-scale

### In-scope
- [`observability-baseline.md`](../../../devops/swarm/observability-baseline.md)
- Rabbit management internal (overlay)
- Optional: Prometheus stack overlay Swarm

### Out-of-scope
- Full Grafana dashboards prod
- APM tracing (Jaeger)

## 2. Files affected

| Tạo | Pattern |
|-----|---------|
| `devops/swarm/observability/` compose overlay (optional) | prometheus + node-exporter |
| `devops/scripts/rabbit-queue-depth.sh` | list_queues parse |
| `docs/phase2-observability-staging.md` | metric thresholds |

## 3. Thiết kế & trách nhiệm

**Metrics tối thiểu** (từ observability-baseline):

- desired vs running tasks
- queue: friend.dm, notification.dispatch, task-ai.*, task.from_file, webhook.delivery
- socket reconnect rate (log grep hoặc metric)
- gateway p95 (nginx or app log)

## 4. Thứ tự triển khai

1. Script queue depth export
2. Cron hoặc manual trước/ sau load test
3. (Optional) Deploy Prometheus scrape dockerd metrics
4. Document alert thresholds = autoscale-policy crossover
5. Link từ ha-infra-roadmap Phase 2 tick

## 5. Test plan

- Script chạy từ manager node — output JSON/text
- Queue depth thay đổi khi publish test message
- Không expose Rabbit management public

## 6. Risk & trade-off

| Rủi ro | Quyết định | Rollback |
|--------|------------|----------|
| Prometheus resource | Lightweight single node staging | Script-only baseline |
| Metric cardinality | Queue names fixed set | Drop labels |
