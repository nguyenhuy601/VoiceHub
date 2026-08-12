# Webhook service — mạng & CORS (S1+)

## Quyết định

- **Không** expose `webhook-service:3016` qua API Gateway hoặc internet public.
- Chỉ microservices trong `enterprise-network` gọi `POST /webhook/*` với header `X-Webhook-Secret`.
- **CORS:** `allow_origins=[]` — server-to-server, không phục vụ browser.

## Cấu hình

| Biến | Ghi chú |
|------|---------|
| `WEBHOOK_SECRET` | Trùng trên friend/task/chat/… service gọi webhook; min 24 ký tự staging |
| `NOTIFICATION_SERVICE_URL` | Nội bộ Docker DNS |

Production: `WEBHOOK_SECRET` default bị từ chối khi `NODE_ENV=production` hoặc `ENV=production`.

## Smoke

```bash
# Từ container khác trên overlay — sai secret → 401
curl -s -o /dev/null -w "%{http_code}" -X POST http://webhook-service:3016/webhook/friend \
  -H "Content-Type: application/json" -H "X-Webhook-Secret: wrong" -d '{}'
```

## Rollback

Giữ webhook chỉ trên overlay; không thêm route `/api/webhook` trên gateway trừ khi có WAF + IP allowlist riêng.
