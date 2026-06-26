# Realtime HA Checklist (S3 / a6)

## Config (staging `.env` + `docker-stack.yml`)

| Biến | Giá trị |
|------|---------|
| `SOCKET_SERVICE_REPLICAS` | `>= 2` |
| `SOCKET_IO_REDIS_ADAPTER` | `true` |
| `REDIS_HOST` / `REDIS_PORT` | Reachable từ mọi socket replica |

```bash
docker stack services voicehub
curl -sf http://127.0.0.1:3000/health
# socket health qua gateway nếu exposed nội bộ
```

`GET /health` trên socket-service trả `redisAdapter: true` khi adapter gắn thành công.

## Load balancer / Nginx (optional edge)

- WS qua gateway + Redis adapter: sticky **không bắt buộc** (xem `staging-nginx-edge.md`).
- Nếu LB riêng socket: `devops/nginx/swarm-socket-sticky.conf` — `ip_hash`, giữ `Upgrade` / `Connection`, `X-Forwarded-*`.

## Validation (manual sign-off)

1. Mở 2 browser clients (2 user).
2. `docker service update --force voicehub_socket-service` (kill 1 task).
3. Verify: reconnect, presence, DM + org realtime.

### Phase 5 — qua Cloudflare hostname

```bash
BASE=https://staging.app.example.com
curl -skf "$BASE/socket.io/?EIO=4&transport=polling"
```

Manual: DevTools WS **101** trên `/socket.io`; DM realtime ≥ 15 phút — [phase5-cloudflare-websocket.md](../../docs/phase5-cloudflare-websocket.md).

```bash
docker stack services voicehub
docker service logs -f voicehub_socket-service
```
