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
7. Smoke: DM, notification, task file, webhook, **voice recording/STT**

## Voice queues (classic → quorum)

Queues: `voice.recording.process`, `voice.stt.chunk`, `voice.summary.process` (+ DLQ tương ứng).

```bash
# Dừng producer/consumer → xóa classic → workers declare quorum → voice-service
bash devops/swarm/rabbitmq-cluster/migrate-voice-queues-to-quorum.sh
```

Hoặc chỉ purge (đã scale down thủ công):

```bash
bash devops/swarm/rabbitmq-cluster/migrate-voice-queues-to-quorum.sh --purge-only
bash devops/swarm/rabbitmq-cluster/purge-classic-queues.sh   # toàn bộ app queues
```

Sau migrate, rebuild/redeploy `voice-service` + Python workers (`voice-recording-worker`, `voice-stt-worker`).

### Điều kiện cluster (quan trọng)

Quorum queue **không chạy** nếu cluster metadata có 3 disk node nhưng chỉ 1 node `running` → lỗi `cluster_not_formed`.

| Môi trường | Yêu cầu |
|------------|---------|
| Production | `RABBITMQ_CLUSTER_SIZE=3`, ≥2 node healthy |
| Dev 1 node | Cluster **chỉ** có 1 disk member (redeploy stack rabbit sạch), không để metadata 3 node |

Kiểm tra trước migrate:

```bash
bash devops/swarm/rabbitmq-cluster/ensure-quorum-cluster-ready.sh
```

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
