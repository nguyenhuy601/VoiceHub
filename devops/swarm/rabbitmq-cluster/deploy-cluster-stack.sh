#!/usr/bin/env bash
# P1-Rabbit-A — Deploy RabbitMQ cluster overlay trên Swarm
# Usage: bash devops/swarm/rabbitmq-cluster/deploy-cluster-stack.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

STACK_NAME="${RABBITMQ_CLUSTER_STACK_NAME:-voicehub-rabbit}"
COMPOSE_FILE="$ROOT/devops/swarm/rabbitmq-cluster/docker-compose.cluster.yml"
NETWORK_NAME="${ENTERPRISE_NETWORK_NAME:-voicehub_enterprise-network}"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

for var in RABBITMQ_ERLANG_COOKIE RABBITMQ_USER RABBITMQ_PASS; do
  if [[ -z "${!var:-}" ]]; then
    echo "[FAIL] Set $var in root .env before deploy" >&2
    exit 1
  fi
done

if ! docker network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
  echo "[FAIL] Overlay network $NETWORK_NAME not found — deploy main stack first" >&2
  exit 1
fi

bash "$ROOT/devops/scripts/normalize-sh-lf.sh"

echo "Deploying RabbitMQ cluster stack: $STACK_NAME (network=$NETWORK_NAME)"
export ENTERPRISE_NETWORK_NAME="$NETWORK_NAME"
export RABBITMQ_USER RABBITMQ_PASS RABBITMQ_ERLANG_COOKIE
docker stack deploy -c "$COMPOSE_FILE" "$STACK_NAME"

echo "Waiting for tasks..."
sleep 15
docker stack services "$STACK_NAME"
docker stack ps "$STACK_NAME" --no-trunc | head -15

echo ""
echo "[OK] RabbitMQ cluster deployed"
echo "AMQP entry: amqp://\${RABBITMQ_USER}:***@rabbitmq-1:5672"
echo "Management: http://rabbitmq-1:15672 (overlay only — không publish public)"
