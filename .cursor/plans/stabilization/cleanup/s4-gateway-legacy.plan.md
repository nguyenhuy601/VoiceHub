---
name: s4-gateway-legacy
overview: "S4a — Dọn gateway: gỡ route/service @deprecated trùng BFF; gỡ orgAclConsumer alias trong chat-service."
todos:
  - id: remove-bootstrap-routes
    content: Gỡ mount bootstrap.routes.js, dashboard-summary.routes.js — chỉ BFF
    status: completed
  - id: remove-bootstrap-service
    content: Xóa hoặc unmount bootstrap.service.js deprecated
    status: completed
  - id: remove-orgacl-alias
    content: Gỡ orgAclConsumer.js alias nếu orgEventsConsumer.js đã thay
    status: completed
  - id: grep-deprecated-mount
    content: Grep @deprecated còn mount trong gateway + chat workers
    status: completed
isProject: false
---

# S4a — Gateway & Worker Legacy Cleanup

**Phụ thuộc:** [operations/s3-realtime-ha-chaos.plan.md](../operations/s3-realtime-ha-chaos.plan.md)  
**Tiếp theo:** [s4-api-pagination-client.plan.md](s4-api-pagination-client.plan.md)  
**Tiêu chí:** Sạch sẽ

## 1. Mục tiêu & phạm vi

### Done
- Gateway chỉ expose BFF routes (`src/bff/routes.js`) cho bootstrap/dashboard
- Không file `@deprecated` vẫn được `app.use()`
- chat-service chỉ một org event consumer

### In-scope
- [`api-gateway/src/routes/bootstrap.routes.js`](../../../api-gateway/src/routes/bootstrap.routes.js)
- [`api-gateway/src/routes/dashboard-summary.routes.js`](../../../api-gateway/src/routes/dashboard-summary.routes.js)
- [`api-gateway/src/services/bootstrap.service.js`](../../../api-gateway/src/services/bootstrap.service.js)
- [`api-gateway/src/app.js`](../../../api-gateway/src/app.js) hoặc route registry
- [`services/chat-service/src/workers/orgAclConsumer.js`](../../../services/chat-service/src/workers/orgAclConsumer.js)

### Out-of-scope
- Xóa client legacy redirects (giữ với sunset date — plan S4c)

## 2. Files affected

**Xóa mount / file:** deprecated routes & service  
**Verify:** `bff/routes.js` cover đủ endpoint cũ  
**Sửa:** `chat-service/src/server.js` import worker

## 3. Thiết kế & trách nhiệm

| Trước | Sau |
|-------|-----|
| bootstrap.routes + bff.routes | chỉ bff.routes |
| orgAclConsumer + orgEventsConsumer | chỉ orgEventsConsumer |

Client đã dùng BFF qua wave-3d — verify không còn gọi path cũ.

## 4. Thứ tự triển khai

1. Grep client gọi `/api/bootstrap`, `/api/dashboard-summary` (path cũ)
2. Xác nhận BFF path tương đương
3. Gỡ mount deprecated trong gateway
4. Xóa file hoặc để file không import (prefer xóa nếu không dùng)
5. Gỡ orgAclConsumer alias
6. Smoke: app boot, dashboard load

## 5. Test plan

- `GET /api/...` bootstrap/shell qua BFF → 200
- Dashboard không 404
- Org ACL event vẫn invalidate cache (orgEventsConsumer)

## 6. Risk & trade-off

| Rủi ro | Quyết định | Rollback |
|--------|------------|----------|
| Client cũ gọi path deprecated | Grep trước; giữ alias 1 sprint nếu cần | Restore route mount |
