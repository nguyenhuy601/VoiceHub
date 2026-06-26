# Migration & lộ trình triển khai

Tài liệu này mô tả **thực tế repo hiện tại** (sau stabilization S0–S4). Các mục **chat-system / chat-room / chat-user tách service** hoặc **Kubernetes + Consul/Eureka** trong tài liệu cũ **không** phản ánh code đang chạy.

## Kiến trúc hiện tại (monorepo)

Một **`chat-service`** (port 3006, REST) + **`socket-service`** (3017, realtime canonical) — không có `chat-system-service`, `chat-room-service`, `chat-user-service`.

| Service | Port | Vai trò |
|---------|-----:|---------|
| api-gateway | 3000 | JWT, RBAC, proxy REST + `/socket.io` |
| auth-service | 3001 | Auth, JWT, refresh |
| chat-service | 3006 | Messages REST, RabbitMQ consumers |
| socket-service | 3017 | Socket.IO `/chat` |
| organization-service | 3013 | Org, channel, member |
| task-service | 3009 | Task, board workers |
| friend-service | 3014 | Friends, DM ACL events |
| … | … | Xem [`ARCHITECTURE.md`](ARCHITECTURE.md), [`docs/spec-pack/01-SYSTEM-SPEC.md`](docs/spec-pack/01-SYSTEM-SPEC.md) |

## Môi trường triển khai

### Development — Docker Compose

```bash
docker compose up -d --build
# Hoặc: docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

Chi tiết: [`docs/DOCKER-COMPOSE.md`](docs/DOCKER-COMPOSE.md), [`README.md`](README.md).

### Staging / production — Docker Swarm

Path **đang dùng** cho staging:

```bash
bash devops/swarm/deploy-stack.sh
# STACK_NAME=voicehub docker-stack.yml
```

- Replica socket: `SOCKET_SERVICE_REPLICAS=2` (root `.env`)
- Validation: [load-chaos-validation.md](devops/swarm/load-chaos-validation.md) — checklist thủ công
- Runbook: [`devops/swarm/README.md`](devops/swarm/README.md)

### Tương lai (chưa implement)

| Hướng | Trạng thái | Tài liệu |
|-------|------------|----------|
| MongoDB Atlas + Redis Sentinel + Rabbit quorum | Sau sign-off stabilization | [`.cursor/plans/phase-1-stateful-ha/`](/.cursor/plans/phase-1-stateful-ha/00-master-index.plan.md) |
| Kubernetes, Consul/Eureka service discovery | **Không** có trong repo | Chỉ tham chiếu lịch sử; Swarm là orchestrator hiện tại |
| Cloudflare / gateway scale | Phase 4–5 hạ tầng | [`devops/swarm/ha-infra-roadmap.md`](devops/swarm/ha-infra-roadmap.md) |

## Stabilization (S0–S4) — đã áp dụng

| Phase | Kết quả chính |
|-------|----------------|
| S0 | Secrets, observability baseline, rollback runbook |
| S1 | Internal tokens, gateway permission map, security smoke |
| S2 | `socket-service` canonical; `CHAT_SOCKET_ENABLED=false` |
| S3 | Socket HA 2 replica + Redis adapter; chaos/load scripts |
| S4 | Gỡ gateway legacy routes; client `pageToken`/refresh; docs align |

Chỉ mục đầy đủ: [`.cursor/plans/stabilization/00-master-index.plan.md`](.cursor/plans/stabilization/00-master-index.plan.md).

## Giao tiếp giữa services

- **Client → gateway**: REST `/api/*`, WebSocket `/socket.io` → socket-service.
- **socket-service → chat-service**: `friend:send` qua RabbitMQ; persist DM.
- **chat-service → socket-service**: `POST /internal/realtime/publish` (`REALTIME_INTERNAL_TOKEN`).
- **Service → service**: HTTP nội bộ + header token (`GATEWAY_INTERNAL_TOKEN`, `CHAT_INTERNAL_TOKEN`, …).
- **Webhook**: `webhook-service` → `notification-service`.

## Health & vận hành

- Mỗi service: `GET /health`
- Kiểm tra env: `bash devops/scripts/check-security-env.sh`
- Smoke stabilization: checklist trong [devops/swarm/load-chaos-validation.md](devops/swarm/load-chaos-validation.md)

## Lưu ý cho contributor

- Cấu hình qua **`.env`** (root + từng service), không dùng `.env.example` làm luồng chuẩn.
- Shared code: package **`@enterprise/shared`** — không thêm business HTTP client vào `shared/`.
- Pagination API: `pageToken` / `before` — không gửi `page` mới từ client (backend vẫn có thể log deprecation).
