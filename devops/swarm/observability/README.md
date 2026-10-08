# P2-Obs — optional Prometheus stack (staging)

Lightweight observability overlay — **không bắt buộc**.

Deploy script đã gỡ. Stack YAML (nếu còn):

```bash
docker stack deploy -c devops/swarm/observability/docker-compose.observability.yml voicehub-obs
```

| Service | Role |
|---------|------|
| `prometheus` | Scrape node-exporter; rules in `alerts.yml` |
| `node-exporter` | Host CPU/RAM/disk (global) |

## Rollback

```bash
docker stack rm voicehub-obs
```
