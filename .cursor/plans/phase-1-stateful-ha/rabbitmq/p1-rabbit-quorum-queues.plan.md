---
name: p1-rabbit-quorum-queues
overview: P1-Rabbit-B — Migrate queue critical sang quorum; consumer reconnect; giữ idempotency dm:corr.
todos:
  - id: queue-inventory
    content: Inventory assertQueue tất cả consumers/publishers
    status: completed
  - id: quorum-migration
    content: Chiến lược drain classic → quorum (staging có thể purge)
    status: completed
  - id: assert-quorum-code
    content: assertQueue với x-queue-type quorum + DLQ quorum
    status: completed
  - id: consumer-reconnect
    content: Reconnect loop cho friendDm, notification, task workers
    status: completed
isProject: false
---

# P1-Rabbit-B — Quorum Queues

**Phụ thuộc:** [p1-rabbit-cluster-stack.plan.md](p1-rabbit-cluster-stack.plan.md)  
**Tiếp theo:** [cutover/p1-swarm-stack-cutover.plan.md](../cutover/p1-swarm-stack-cutover.plan.md)  
**Tiêu chí:** Stateful HA — Rabbit app

## 1. Mục tiêu & phạm vi

### Done
- Queue critical dùng quorum type
- Kill leader node — no message loss; queue depth → 0 sau recovery
- Idempotency `dm:corr:*` unchanged
- [`load-chaos-validation.md`](../../../devops/swarm/load-chaos-validation.md) Rabbit criteria pass

### In-scope
- [`friendDmConsumer.js`](../../../services/chat-service/src/workers/friendDmConsumer.js)
- [`notificationDispatch.worker.js`](../../../services/notification-service/src/workers/notificationDispatch.worker.js)
- Task/AI/webhook publishers & workers
- [`shared/messaging/orgEvents.js`](../../../shared/messaging/orgEvents.js) nếu assert queue

### Out-of-scope
- Đổi exchange topology (giữ `voicehub.topic` topic)
- Kafka migration

## 2. Files affected

| Sửa | Pattern |
|-----|---------|
| Chat `friendDmConsumer.js` | `arguments: { 'x-queue-type': 'quorum' }` |
| Notification worker + DLQ | quorum DLQ `voicehub.notification.dispatch.dlq` |
| Task/AI/webhook workers | same pattern |
| Org events consumer | nếu có assertQueue |

## 3. Thiết kế & trách nhiệm

**Queue inventory:**
- `voicehub.friend.dm`
- `voicehub.notification.dispatch` + DLQ
- `task-ai.extract`, `task-ai.sync`
- `voicehub.task.from_file`
- `voicehub.webhook.delivery`
- Org ACL queues

**Migration staging:** purge classic + declare quorum cùng tên (downtime ngắn) HOẶC suffix `.quorum` + dual consume → cutover.

**Consumer reconnect (minimal):**
```js
async function runWithReconnect(startFn) {
  for (;;) {
    try { await startFn(); } catch (e) { await sleep(5000); }
  }
}
```

## 4. Thứ tự triển khai

1. Grep `assertQueue` toàn repo — bảng queue → file
2. Chọn migration strategy (staging: purge OK)
3. Update assertQueue quorum — deploy consumers trước publishers
4. Deploy publishers
5. Drain test message qua từng queue
6. Chaos: kill 2/3 rabbit nodes sequential — verify DLQ chỉ exhausted retry

## 5. Test plan

- DM end-to-end qua queue
- Notification dispatch worker
- Task file upload → worker
- Node kill — backlog drains; `dm:corr` skip duplicate OK

## 6. Risk & trade-off

| Rủi ro | Quyết định | Rollback |
|--------|------------|----------|
| Quorum không hỗ trợ classic policy | Staging purge | Revert assertQueue classic |
| Queue rename break env | Giữ tên queue; chỉ đổi type khi empty | Restore từ backup volume |
