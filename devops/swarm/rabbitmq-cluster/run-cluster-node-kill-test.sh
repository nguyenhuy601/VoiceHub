#!/usr/bin/env bash
# P1-Rabbit-A — Kill cluster node(s); verify quorum + AMQP publish + queue depth
# bash devops/swarm/rabbitmq-cluster/run-cluster-node-kill-test.sh
# RABBITMQ_CLUSTER_MODE=swarm — dùng stack Swarm đã deploy
# RABBIT_KILL_NODES=2 — P1-Validation: kill 2/3 nodes
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

CLUSTER_DIR="$ROOT/devops/swarm/rabbitmq-cluster"
COMPOSE_PROJECT="${RABBITMQ_CLUSTER_PROJECT:-voicehub-rabbit}"
NET="voicehub-rabbitmq-cluster-local"
MODE="${RABBITMQ_CLUSTER_MODE:-local}"
FAIL=0

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

for var in RABBITMQ_ERLANG_COOKIE RABBITMQ_USER RABBITMQ_PASS; do
  if [[ -z "${!var:-}" ]]; then
    echo "[FAIL] Missing $var in .env" >&2
    exit 1
  fi
done

cluster_running_nodes() {
  local exec_host="$1"
  docker exec "$exec_host" rabbitmqctl cluster_status 2>/dev/null \
    | sed -n '/Running Nodes/,/Versions/p' \
    | grep -c 'rabbit@rabbitmq-' || echo 0
}

amqp_publish_test() {
  local url="$1"
  local label="$2"
  MSYS_NO_PATHCONV=1 docker run --rm --network "$NET" \
    -e AMQP_URL="$url" \
    node:20-alpine sh -c '
      npm install amqplib --no-save --prefix /tmp/a >/dev/null 2>&1
      node -e "
        const amqp = require(\"/tmp/a/node_modules/amqplib\");
        const url = process.env.AMQP_URL;
        (async () => {
          const conn = await amqp.connect(url);
          const ch = await conn.createChannel();
          const q = \"voicehub.cluster.smoke\";
          await ch.assertQueue(q, { durable: false, autoDelete: true });
          ch.sendToQueue(q, Buffer.from(\"ping\"));
          await ch.close();
          await conn.close();
          console.log(\"AMQP publish OK\");
        })().catch(e => { console.error(e); process.exit(1); });
      "
    ' && echo "[OK] AMQP publish ($label)" || { echo "[FAIL] AMQP publish ($label)"; return 1; }
}

if [[ "$MODE" == "local" ]]; then
  echo "[INFO] Starting local RabbitMQ cluster..."
  docker compose --env-file "$ROOT/.env" \
    -f "$CLUSTER_DIR/docker-compose.cluster.yml" \
    -f "$CLUSTER_DIR/docker-compose.cluster.local.yml" \
    -p "$COMPOSE_PROJECT" \
    up -d
  sleep 90
  NET="voicehub-rabbitmq-cluster-local"
  NODE1="${COMPOSE_PROJECT}-rabbitmq-1-1"
  NODE2="${COMPOSE_PROJECT}-rabbitmq-2-1"
elif [[ "$MODE" == "swarm" ]]; then
  NET="${ENTERPRISE_NETWORK_NAME:-voicehub_enterprise-network}"
  echo "[INFO] Waiting for RabbitMQ cluster tasks..."
  for _ in $(seq 1 60); do
    up="$(docker ps --format '{{.Names}}' | grep -c 'rabbitmq-' || true)"
    if [[ "$up" -ge 3 ]]; then
      break
    fi
    sleep 3
  done
  NODE1="$(docker ps --format '{{.Names}}' | grep 'rabbitmq-1\.' | head -1)"
  NODE2="$(docker ps --format '{{.Names}}' | grep 'rabbitmq-2\.' | head -1)"
else
  echo "[FAIL] Unknown RABBITMQ_CLUSTER_MODE=$MODE" >&2
  exit 1
fi

if [[ -z "$NODE1" ]] || ! docker ps --format '{{.Names}}' | grep -q "$NODE1"; then
  NODE1="$(docker ps --format '{{.Names}}' | grep 'rabbitmq-1' | head -1)"
fi
if [[ -z "$NODE2" ]]; then
  NODE2="$(docker ps --format '{{.Names}}' | grep 'rabbitmq-2' | head -1)"
fi

if [[ -z "$NODE1" ]]; then
  echo "[FAIL] rabbitmq-1 container not found"
  exit 1
fi

echo "=== cluster_status (before) ==="
docker exec "$NODE1" rabbitmqctl cluster_status | head -25

RUNNING="$(cluster_running_nodes "$NODE1")"
echo "Running nodes: $RUNNING"
if [[ "$RUNNING" -lt 3 ]]; then
  echo "[WARN] expected 3 running nodes (got $RUNNING) — continuing"
fi

ENC_PASS="$(python3 -c "import urllib.parse; print(urllib.parse.quote('''$RABBITMQ_PASS''', safe=''))" 2>/dev/null || node -e "console.log(encodeURIComponent(process.argv[1]))" "$RABBITMQ_PASS")"
AMQP_URL="amqp://${RABBITMQ_USER}:${ENC_PASS}@rabbitmq-1:5672"

echo ""
amqp_publish_test "$AMQP_URL" "before kill" || FAIL=1

if [[ -n "$NODE2" ]]; then
  echo ""
  echo "=== Kill node rabbitmq-2 ($NODE2) ==="
  docker kill "$NODE2" >/dev/null 2>&1 || docker stop "$NODE2" >/dev/null
  sleep 15
fi

NODE3="$(docker ps --format '{{.Names}}' | grep 'rabbitmq-3\.' | head -1)"
KILL_COUNT="${RABBIT_KILL_NODES:-1}"
if [[ "$KILL_COUNT" -ge 2 && -n "$NODE3" ]]; then
  echo ""
  echo "=== Kill node rabbitmq-3 ($NODE3) — 2/3 nodes down ==="
  docker kill "$NODE3" >/dev/null 2>&1 || docker stop "$NODE3" >/dev/null
  sleep 20
  RUNNING_2="$(cluster_running_nodes "$NODE1")"
  echo "Running nodes after 2 kills: $RUNNING_2"
  if [[ "$RUNNING_2" -lt 1 ]]; then
    echo "[FAIL] cluster has no running nodes after 2/3 kill"
    FAIL=1
  elif [[ "$RUNNING_2" -lt 2 ]]; then
    echo "[OK] quorum path: 1 node surviving (expected for 2/3 kill on 3-node cluster)"
  else
    echo "[OK] cluster still has >= 2 running nodes"
  fi
  amqp_publish_test "$AMQP_URL" "after 2/3 kill" || FAIL=1
fi

queue_depths() {
  docker exec "$NODE1" rabbitmqctl list_queues name messages 2>/dev/null \
    | awk 'NR>1 && $2 ~ /^[0-9]+$/ {print $1, $2}'
}

if [[ "${RABBIT_QUEUE_DRAIN_CHECK:-1}" == "1" ]]; then
  echo ""
  echo "=== Queue depth (quorum queues) ==="
  depths="$(queue_depths || true)"
  echo "${depths:-<empty>}"
  high=0
  while read -r q depth; do
    [[ -z "$q" ]] && continue
    if [[ "${depth:-0}" -gt 100 ]]; then
      echo "[WARN] Queue $q depth=$depth (>100)"
      high=1
    fi
  done <<< "$depths"
  if [[ "$high" -eq 0 ]]; then
    echo "[OK] No quorum queue depth >100"
  else
    FAIL=1
  fi
fi

echo ""
echo "=== cluster_status (after kill) ==="
docker exec "$NODE1" rabbitmqctl cluster_status | head -25

RUNNING_AFTER="$(cluster_running_nodes "$NODE1")"
echo "Running nodes after kill: $RUNNING_AFTER"
if [[ "$KILL_COUNT" -ge 2 ]]; then
  if [[ "$RUNNING_AFTER" -lt 1 ]]; then
    echo "[FAIL] no surviving nodes after 2/3 kill"
    FAIL=1
  else
    echo "[OK] at least one node survived 2/3 kill"
  fi
elif [[ "$RUNNING_AFTER" -lt 2 ]]; then
  echo "[FAIL] cluster unhealthy after node kill"
  FAIL=1
else
  echo "[OK] cluster still has >= 2 running nodes"
fi

if [[ "$KILL_COUNT" -lt 2 ]]; then
  echo ""
  amqp_publish_test "$AMQP_URL" "after kill" || FAIL=1
fi

if [[ "$MODE" == "local" && "${RABBITMQ_CLUSTER_LEAVE_UP:-0}" != "1" ]]; then
  echo ""
  echo "[INFO] Stopping local cluster (RABBITMQ_CLUSTER_LEAVE_UP=1 to keep)"
  docker compose --env-file "$ROOT/.env" \
    -f "$CLUSTER_DIR/docker-compose.cluster.yml" \
    -f "$CLUSTER_DIR/docker-compose.cluster.local.yml" \
    -p "$COMPOSE_PROJECT" \
    down
fi

if [[ "$FAIL" -ne 0 ]]; then
  echo "cluster-node-kill-test: FAILED"
  exit 1
fi
echo "cluster-node-kill-test: PASSED"
