---
name: s1-chat-idor-dm
overview: S1a — Vá IDOR chat (getMessageById, markAsRead) và kiểm tra friendship trước DM (REST + RabbitMQ consumer).
todos:
  - id: idor-get-message
    content: getMessageById — chỉ sender/receiver/room member
    status: completed
  - id: idor-mark-read
    content: markAsRead — chỉ receiver hợp lệ
    status: completed
  - id: dm-friendship-rest
    content: createMessage DM — verify friendship qua friend-service
    status: completed
  - id: dm-friendship-queue
    content: friendDmConsumer — policy đồng bộ với REST
    status: completed
isProject: false
---

# S1a — Chat IDOR & DM Policy

**Phụ thuộc:** [foundation/s0-secrets-observability.plan.md](../foundation/s0-secrets-observability.plan.md)  
**Tiếp theo:** [s1-internal-tokens.plan.md](s1-internal-tokens.plan.md)  
**Tiêu chí:** An toàn

## 1. Mục tiêu & phạm vi

### Done
- User A không đọc/mark-read tin của B bằng `messageId`
- DM tới non-friend → 403 (REST) / reject hoặc skip (queue)
- Security smoke chat/DM pass

### In-scope
- [`services/chat-service/src/services/message.service.js`](../../../services/chat-service/src/services/message.service.js)
- [`services/chat-service/src/controllers/message.controller.js`](../../../services/chat-service/src/controllers/message.controller.js)
- [`services/chat-service/src/workers/friendDmConsumer.js`](../../../services/chat-service/src/workers/friendDmConsumer.js)
- Gọi friend-service (hoặc cache Redis ngắn TTL)

### Out-of-scope
- Socket rate limit (plan tokens/gateway sau)
- Refactor message model

## 2. Files affected

**Sửa:** `message.service.js`, `message.controller.js`, `friendDmConsumer.js`  
**Có thể thêm:** helper `assertCanAccessMessage(userId, message)` trong service layer  
**Không đụng:** gateway auth middleware, socket-service namespace logic

## 3. Thiết kế & trách nhiệm

| Layer | Trách nhiệm |
|-------|-------------|
| `message.service` | ACL đọc tin: DM = sender/receiver; room = member org channel |
| `message.controller` | Gọi ACL trước trả response; friendship check trước `createMessage` |
| `friendDmConsumer` | Validate sender + friendship trước persist (tin cậy queue nhưng policy giống REST) |

**Hiện trạng:** `getMessageById` trả tin theo ID không kiểm tra user — lỗ hổng IDOR.

## 4. Thứ tự triển khai

1. Implement `assertCanAccessMessage` + dùng trong `getMessageById` controller
2. `markAsRead`: load message → verify receiver (hoặc room read policy)
3. REST DM: gọi friend-service `GET /friends` hoặc endpoint check — cache Redis 60–120s
4. `friendDmConsumer`: cùng policy friendship
5. Manual security smoke

## 5. Test plan

Từ [`devops/scripts/security-regression-smoke.md`](../../../devops/scripts/security-regression-smoke.md):
- User A: `GET /api/messages/:id` tin của B → 403
- User A: `PATCH /api/messages/:id/read` tin gửi cho B → 403
- DM tới user không phải friend → 403

Integration: double-submit DM queue — idempotency `dm:corr:*` vẫn hoạt động.

## 6. Risk & trade-off

| Rủi ro | Quyết định | Rollback |
|--------|------------|----------|
| Friendship check chậm DM | Cache Redis friend list | Feature flag `DM_REQUIRE_FRIENDSHIP=false` staging only |
| Room ACL phức tạp | Reuse `assertCanWriteInOrgChannel` pattern có sẵn | Revert controller commit |
