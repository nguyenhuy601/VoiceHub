# P1-Rabbit-A — RabbitMQ Cluster Stack

**Plan:** [p1-rabbit-cluster-stack.plan.md](../../../.cursor/plans/phase-1-stateful-ha/rabbitmq/p1-rabbit-cluster-stack.plan.md)  
**Tiếp theo:** [p1-rabbit-quorum-queues.plan.md](../../../.cursor/plans/phase-1-stateful-ha/rabbitmq/p1-rabbit-quorum-queues.plan.md)

## Kiến trúc

```text
rabbitmq-1 (seed) ← rabbitmq-2, rabbitmq-3 join_cluster
RABBITMQ_ERLANG_COOKIE đồng bộ (root .env)
hostname cố định: rabbitmq-1 | rabbitmq-2 | rabbitmq-3
```

Overlay: `enterprise-network` — **không publish** `5672` / `15672` ra host public.

## Biến môi trường (root `.env`)

```bash
RABBITMQ_USER=voicehub
RABBITMQ_PASS=<secret>
RABBITMQ_ERLANG_COOKIE=<secret-cookie>
RABBITMQ_URL=amqp://voicehub:<pass>@rabbitmq-1:5672
```

| Biến | Mô tả |
|------|--------|
| `RABBITMQ_URL` | AMQP entry — **khuyến nghị** `rabbitmq-1:5672` (seed) |
| `RABBITMQ_ERLANG_COOKIE` | Bắt buộc giống nhau trên 3 node |
| `RABBITMQ_USER` / `RABBITMQ_PASS` | Auth AMQP + Management |

**Dev compose single node:** giữ `RABBITMQ_URL=...@rabbitmq:5672` (không set cookie cluster).

**Staging cutover:** deploy cluster stack → đổi `RABBITMQ_URL` → rolling redeploy publishers/consumers.

## AMQP entry & client reconnect

| Client | Env | Hành vi |
|--------|-----|---------|
| Publishers | `RABBITMQ_URL` | `amqplib.connect(url)` — reconnect on `error`/`close` (plan quorum bổ sung wrapper) |
| Consumers | cùng URL | `conn.on('error')` → restart consumer loop |

Workers liên quan: `friendDmConsumer`, `notificationDispatch.worker`, `taskFromFileWorker`, `ai-task-worker`, webhook worker.

**Sau kill 1 node:** cluster còn quorum disk nodes; client trỏ `rabbitmq-1` vẫn publish được. Nếu connection hang → `docker service update --force <worker>` hoặc chờ reconnect.

**Không** dùng round-robin DNS tùy ý trên Swarm — dùng hostname seed `rabbitmq-1` hoặc internal LB (out-of-scope).

## Management UI (nội bộ)

- URL: `http://rabbitmq-1:15672` (chỉ từ container/máy trong overlay/VPN)
- Auth: `RABBITMQ_USER` / `RABBITMQ_PASS`
- **Không** map port `15672` trong stack file

Truy cập debug:

```bash
docker exec -it <rabbitmq-1-container> rabbitmqctl cluster_status
```

## Deploy Swarm

```bash
bash devops/swarm/deploy-stack.sh
bash devops/swarm/rabbitmq-cluster/deploy-cluster-stack.sh
```

Placement: `spread: node.id` — true HA cần ≥2 Swarm nodes.

## Verify

```bash
bash devops/swarm/rabbitmq-cluster/run-cluster-node-kill-test.sh
node tests/rabbitmq-cluster-stack.smoke.js
```

## Rollback

```bash
docker stack rm voicehub-rabbit
# Revert RABBITMQ_URL → rabbitmq:5672 (single service trong docker-stack.yml)
```
