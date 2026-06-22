# Internal tokens — deploy đồng bộ (S1b)

## Tokens

| Biến | Header | Service nhận / gửi |
|------|--------|-------------------|
| `REALTIME_INTERNAL_TOKEN` | `x-realtime-token` | **socket-service** nhận `POST /internal/realtime/publish`; gửi từ chat, notification, task, org, voice, friend (`*/clients/realtime.client.js`) |
| `CHAT_INTERNAL_TOKEN` | `x-internal-token` | **chat-service** routes `/internal/*`; gửi từ task-worker, ai-task, voice call log, task-service |

## Quy tắc

1. **Một giá trị** cho mỗi token trong toàn stack staging/prod (root `.env` là nguồn chính).
2. **Deploy atomic:** cập nhật `.env` → redeploy **cùng lúc** socket-service + mọi service gọi `emitRealtimeEvent`; tương tự chat-service + callers `CHAT_INTERNAL_TOKEN`.
3. **Production fail-fast:** `socket-service` và `chat-service` thoát nếu thiếu token khi `NODE_ENV=production`.
4. **Publish fail-closed:** thiếu/sai `x-realtime-token` → `401`; chưa cấu hình token → `503`.
5. **Socket :3017** không publish ra host — chỉ overlay `enterprise-network` + gateway WS proxy.

## Checklist deploy

```bash
# 1. Rotate hoặc set token (min 24 ký tự)
bash devops/scripts/rotate-staging-secrets.sh --apply

# 2. Verify env
VOICEHUB_ENV_CHECK=staging bash devops/scripts/check-security-env.sh

# 3. Redeploy (ví dụ Swarm)
docker stack deploy -c docker-stack.yml voicehub

# 4. Smoke nội bộ (từ container trên overlay)
# Không token → 401
curl -s -o /dev/null -w "%{http_code}" -X POST http://socket-service:3017/internal/realtime/publish \
  -H "Content-Type: application/json" -d '{}'
# Có token → 400 (missing event) hoặc 200 — không phải 401
curl -s -o /dev/null -w "%{http_code}" -X POST http://socket-service:3017/internal/realtime/publish \
  -H "Content-Type: application/json" \
  -H "x-realtime-token: $REALTIME_INTERNAL_TOKEN" \
  -d '{"event":"test"}'
```

## Rollback

```bash
docker service update --rollback voicehub_socket-service
docker service update --rollback voicehub_chat-service
# Khôi phục .env backup nếu đã rotate
```

## Dev local

- Set `REALTIME_INTERNAL_TOKEN` và `CHAT_INTERNAL_TOKEN` trong root `.env`.
- Compose: `socket-service` dùng `expose: 3017` (không map host) — WS qua gateway `:3000`.
