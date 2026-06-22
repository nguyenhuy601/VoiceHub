---
name: s1-internal-tokens
overview: S1b — Fail-closed internal tokens (REALTIME, CHAT), không expose socket :3017, đồng bộ secret nội bộ giữa services.
todos:
  - id: realtime-fail-closed
    content: socket-service từ chối POST /internal/realtime/publish khi REALTIME_INTERNAL_TOKEN set mà thiếu/sai header
    status: completed
  - id: chat-internal-verify
    content: Xác nhận chat-service internal routes fail-closed tương tự CHAT_INTERNAL_TOKEN
    status: completed
  - id: no-public-socket-port
    content: docker-stack.yml — socket-service không publish ra host public
    status: completed
  - id: token-sync-deploy
    content: Document/deploy đồng bộ token cho chat, socket, gateway workers
    status: completed
isProject: false
---

# S1b — Internal Tokens & Network Exposure

**Phụ thuộc:** [s1-chat-idor-dm.plan.md](s1-chat-idor-dm.plan.md)  
**Tiếp theo:** [s1-gateway-permissions.plan.md](s1-gateway-permissions.plan.md)  
**Tiêu chí:** An toàn

## 1. Mục tiêu & phạm vi

### Done
- `POST /internal/realtime/publish` → 401 khi token sai/thiếu (production/staging)
- Port 3017 chỉ reachable từ overlay network / gateway
- `CHAT_INTERNAL_TOKEN` routes đã `internalServiceOnly`

### In-scope
- [`services/socket-service/src/server.js`](../../../services/socket-service/src/server.js)
- [`services/chat-service/src/routes/message.routes.js`](../../../services/chat-service/src/routes/message.routes.js) (verify)
- [`docker-stack.yml`](../../../docker-stack.yml) ports section socket-service

### Out-of-scope
- Webhook-service CORS (P1 security-hardening)
- mTLS service mesh

## 2. Files affected

| Sửa | Verify only |
|-----|-------------|
| `socket-service/src/server.js` | `chat-service` internal middleware |
| `docker-stack.yml` | `emitRealtimeEvent` client env |

## 3. Thiết kế & trách nhiệm

| Service | Hành vi |
|---------|---------|
| socket-service | Fail-closed: nếu `REALTIME_INTERNAL_TOKEN` non-empty → bắt buộc `x-realtime-token` khớp |
| chat-service | `internalServiceOnly` + `CHAT_INTERNAL_TOKEN` |
| Swarm network | socket không `ports:` ra host (chỉ gateway proxy) |

Gateway pattern tham chiếu: [`api-gateway/src/server.js`](../../../api-gateway/src/server.js) fail-fast JWT prod.

## 4. Thứ tự triển khai

1. Audit `socket-service` publish handler — thêm reject khi env set + header sai
2. Deploy token mới đồng thời: chat-service, socket-service, mọi caller `emitRealtimeEvent`
3. Rà `docker-stack.yml`: bỏ publish 3017 nếu đang expose host
4. Smoke: chat gửi tin → realtime event vẫn tới client; gọi publish không token → 401

## 5. Test plan

```bash
# Nội bộ staging — không token
curl -X POST http://socket-service:3017/internal/realtime/publish → 401

# Có token — 200
curl -H "x-realtime-token: $REALTIME_INTERNAL_TOKEN" ...
```

- E2E: gửi DM + org message → client nhận realtime
- `check-security-env.sh` pass

## 6. Risk & trade-off

| Rủi ro | Quyết định | Rollback |
|--------|------------|----------|
| Token lệch giữa services → mất realtime | Deploy atomic cùng stack update | Rollback socket + chat cùng lúc |
| Dev local cần token | `.env` dev set token hoặc skip khi `NODE_ENV=development` | Document dev exception rõ ràng |
