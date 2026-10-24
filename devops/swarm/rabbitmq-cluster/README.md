# P1-Rabbit-A — RabbitMQ Cluster Stack

**Plan:** [p1-rabbit-cluster-stack.plan.md](../../../.cursor/plans/phase-1-stateful-ha/rabbitmq/p1-rabbit-cluster-stack.plan.md)  
**Tiếp theo:** [p1-rabbit-quorum-queues.plan.md](../../../.cursor/plans/phase-1-stateful-ha/rabbitmq/p1-rabbit-quorum-queues.plan.md)

## Kiến trúc

```text
rabbitmq (seed, hostname rabbitmq-1) ← rabbitmq-2, rabbitmq-3 join_cluster  (HA, RABBITMQ_CLUSTER_SIZE=3)
RABBITMQ_ERLANG_COOKIE đồng bộ (root .env)
service DNS: rabbitmq | rabbitmq-2 | rabbitmq-3
hostname Erlang seed: rabbitmq-1 (không đổi — quorum/Khepri không rename node)
```

**Tạm thời single-node (tiết kiệm RAM):** `RABBITMQ_CLUSTER_SIZE=1` (mặc định deploy) — chỉ service `rabbitmq`, override `docker-compose.cluster.single.yml` scale `rabbitmq-2/3` về 0. Khôi phục HA: đặt `RABBITMQ_CLUSTER_SIZE=3` rồi `bash devops/swarm/rabbitmq-cluster/deploy-cluster-stack.sh`.

Overlay: `enterprise-network` — **không publish** `5672` / `15672` ra host public.

## Biến môi trường (root `.env`)

```bash
RABBITMQ_USER=voicehub
RABBITMQ_PASS=<secret>
RABBITMQ_ERLANG_COOKIE=<secret-cookie>
RABBITMQ_URL=amqp://voicehub:<pass>@rabbitmq:5672
```

| Biến | Mô tả |
|------|--------|
| `RABBITMQ_URL` | AMQP entry — service DNS `rabbitmq:5672` (seed). Alias `rabbitmq-1` chỉ cho Erlang join |
| `RABBITMQ_ERLANG_COOKIE` | Bắt buộc giống nhau trên 3 node |
| `RABBITMQ_USER` / `RABBITMQ_PASS` | Auth AMQP + Management |

**Dev compose single node:** giữ `RABBITMQ_URL=...@rabbitmq:5672` (không set cookie cluster).

**Staging cutover:** deploy cluster stack → đổi `RABBITMQ_URL` → rolling redeploy publishers/consumers.

## AMQP entry & client reconnect

| Client | Env | Hành vi |
|--------|-----|---------|
| Publishers | `RABBITMQ_URL` | `amqplib.connect(url)` — reconnect on `error`/`close` (plan quorum bổ sung wrapper) |
| Consumers | cùng URL | `conn.on('error')` → restart consumer loop |

Workers liên quan: `friendDmConsumer`, `notificationDispatch.worker`, `taskFromFileWorker`, `report-etl-worker` (và worker trong từng service khi bật).

**Sau kill 1 node:** cluster còn quorum disk nodes; client trỏ `rabbitmq` vẫn publish được. Nếu connection hang → `docker service update --force <worker>` hoặc chờ reconnect.

**Không** dùng round-robin DNS tùy ý trên Swarm — dùng service seed `rabbitmq` hoặc internal LB (out-of-scope).

## Management UI (nội bộ)

- URL: `http://rabbitmq:15672` (chỉ từ container/máy trong overlay/VPN)
- Auth: `RABBITMQ_USER` / `RABBITMQ_PASS`
- **Không** map port `15672` trong stack file

Truy cập debug:

```bash
docker exec -it <voicehub-rabbit_rabbitmq container> rabbitmqctl cluster_status
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
