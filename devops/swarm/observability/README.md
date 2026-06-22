# P2-Obs — optional Prometheus stack (staging)

Lightweight observability overlay — **không bắt buộc**; script baseline đủ cho sign-off.

## Deploy

```bash
bash devops/swarm/observability/deploy-observability-stack.sh
```

| Service | Role |
|---------|------|
| `prometheus` | Scrape node-exporter; rules in `alerts.yml` |
| `node-exporter` | Host CPU/RAM/disk (global) |

**Queue depth** không scrape trực tiếp từ Rabbit management (không public). Dùng:

```bash
bash devops/swarm/run-p2-observability-baseline.sh
```

## Rollback

```bash
docker stack rm voicehub-obs
```

## Resource

~320M RAM limit total. Trên Docker Desktop 14GB — deploy sau khi scale workers xuống nếu `insufficient resources`.

## Liên kết

- [`docs/phase2-observability-staging.md`](../../../docs/phase2-observability-staging.md)
- [`alerts.yml`](./alerts.yml) — thresholds = [`autoscale-policy.md`](../autoscale-policy.md)
