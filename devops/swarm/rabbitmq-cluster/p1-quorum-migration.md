# P1-Rabbit-B — Quorum Migration (staging)

**Phụ thuộc:** [P1-Rabbit-A cluster](./README.md)  
**Inventory:** [`docs/rabbitmq-quorum-inventory.md`](../../../docs/rabbitmq-quorum-inventory.md)

## Chiến lược (staging)

1. **Freeze** publishers ngắn (optional)
2. **Drain** queue depth ≈ 0 (`rabbitmqctl list_queues`)
3. **Purge / delete** classic queue (staging OK mất message tạm):

```bash
# (script đã gỡ) purge classic queues thủ công qua rabbitmqctl / management UI
```

4. Set `RABBITMQ_QUORUM_QUEUES=true` trong `.env` (mặc định code = true)
5. **Deploy consumers trước** (assert quorum)
6. **Deploy publishers** + workers
7. Smoke: DM, notification, task file, **voice recording/STT**

## Voice queues (classic → quorum)

Queues: `voice.recording.process`, `voice.stt.chunk`, `voice.summary.process` (+ DLQ tương ứng).

Helper migrate/purge đã gỡ. Làm thủ công:

1. Scale down voice/workers
2. `rabbitmqctl list_queues` → delete classic queues voice.*
3. Set `RABBITMQ_QUORUM_QUEUES=true` → redeploy consumers rồi publishers
4. Rebuild/redeploy `voice-service` (+ workers nếu còn)

### Điều kiện cluster (quan trọng)

Quorum queue **không chạy** nếu cluster metadata có 3 disk node nhưng chỉ 1 node `running` → lỗi `cluster_not_formed`.

| Môi trường | Yêu cầu |
|------------|---------|
| Production | `RABBITMQ_CLUSTER_SIZE=3`, ≥2 node healthy |
| Dev 1 node | Cluster **chỉ** có 1 disk member (redeploy stack rabbit sạch), không để metadata 3 node |

Dev single-node bị lệch metadata (đã từng chạy 3 node): redeploy cluster stack sau khi xóa volume rabbit, hoặc scale đủ 2/3 node trước khi migrate.

## Rollback

```bash
# .env
RABBITMQ_QUORUM_QUEUES=false
```

Purge quorum queues nếu cần, redeploy classic.

## Client reconnect

Consumers dùng `runWithReconnect` — sau node kill cluster, session AMQP đóng → tự connect lại sau 5s.

Publishers: connection ngắn; lỗi → caller retry hoặc worker reconnect.
