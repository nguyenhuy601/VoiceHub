# P1-Rabbit-B — Quorum Migration (staging)

**Phụ thuộc:** [P1-Rabbit-A cluster](./README.md)  
**Inventory:** [`docs/rabbitmq-quorum-inventory.md`](../../../docs/rabbitmq-quorum-inventory.md)

## Chiến lược (staging)

1. **Freeze** publishers ngắn (optional)
2. **Drain** queue depth ≈ 0 (`rabbitmqctl list_queues`)
3. **Purge / delete** classic queue (staging OK mất message tạm):

```bash
bash devops/swarm/rabbitmq-cluster/purge-classic-queues.sh
```

4. Set `RABBITMQ_QUORUM_QUEUES=true` trong `.env` (mặc định code = true)
5. **Deploy consumers trước** (assert quorum)
6. **Deploy publishers** + workers
7. Smoke: DM, notification, task file, webhook

## Rollback

```bash
# .env
RABBITMQ_QUORUM_QUEUES=false
```

Purge quorum queues nếu cần, redeploy classic.

## Client reconnect

Consumers dùng `runWithReconnect` — sau node kill cluster, session AMQP đóng → tự connect lại sau 5s.

Publishers: connection ngắn; lỗi → caller retry hoặc worker reconnect.
