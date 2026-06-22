#!/usr/bin/env bash
# P2-Workers — burst publish + queue drain verify
# Usage: bash devops/swarm/run-p2-worker-queue-drain.sh
#   P2_BURST_COUNT=15 P2_DRAIN_WAIT_SEC=90 bash devops/swarm/run-p2-worker-queue-drain.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

NET="${ENTERPRISE_NETWORK_NAME:-voicehub_enterprise-network}"
BURST="${P2_BURST_COUNT:-12}"
WAIT_SEC="${P2_DRAIN_WAIT_SEC:-90}"
FAIL=0

pass() { echo "[PASS] $1"; }
fail() { echo "[FAIL] $1"; FAIL=1; }

list_depths() {
  local rab="$1"
  docker exec "$rab" rabbitmqctl list_queues name messages consumers 2>/dev/null \
    | awk '$1 ~ /^(voicehub\.notification\.dispatch|voicehub\.webhook\.delivery|voicehub\.task\.from_file|task-ai\.extract|task-ai\.sync)$/' \
    || true
}

RAB="$(docker ps -q -f name=voicehub-rabbit_rabbitmq-1 | head -1 || true)"
if [[ -z "$RAB" ]]; then
  echo "[FAIL] rabbitmq-1 container not found"
  exit 1
fi

if [[ -z "${RABBITMQ_URL:-}" ]]; then
  echo "[FAIL] RABBITMQ_URL not set"
  exit 1
fi

echo "=== P2 worker queue drain test ==="
echo "BURST=$BURST WAIT_SEC=$WAIT_SEC"

echo ""
echo "=== Baseline queue depth ==="
BASE="$(list_depths "$RAB")"
echo "$BASE"

echo ""
echo "=== Burst publish (webhook no-op + notification fast-fail) ==="
MSYS_NO_PATHCONV=1 docker run --rm --network "$NET" \
  -e AMQP_URL="$RABBITMQ_URL" \
  -e BURST="$BURST" \
  node:20-alpine sh -c '
    npm install amqplib --no-save --prefix /tmp/a >/dev/null 2>&1
    node -e "
      const amqp = require(\"/tmp/a/node_modules/amqplib\");
      const burst = Number(process.env.BURST || 12);
      const url = process.env.AMQP_URL;
      (async () => {
        const conn = await amqp.connect(url);
        const ch = await conn.createChannel();
        const quorumArgs = { \"x-queue-type\": \"quorum\" };
        const webhookQ = \"voicehub.webhook.delivery\";
        const notifQ = \"voicehub.notification.dispatch\";
        await ch.assertQueue(webhookQ, { durable: true, arguments: quorumArgs });
        await ch.assertQueue(notifQ, { durable: true, arguments: quorumArgs });
        for (let i = 0; i < burst; i++) {
          ch.sendToQueue(webhookQ, Buffer.from(JSON.stringify({
            domain: \"friend\",
            data: { event_type: \"p2_smoke_unknown\", request_id: \"p2-\" + i }
          })), { persistent: true, contentType: \"application/json\" });
          ch.sendToQueue(notifQ, Buffer.from(JSON.stringify({
            kind: \"bulk\", userIds: [], notification: { type: \"p2_smoke\" }
          })), { persistent: true, contentType: \"application/json\" });
        }
        await ch.close();
        await conn.close();
        console.log(\"published\", burst * 2, \"messages\");
      })().catch(e => { console.error(e); process.exit(1); });
    "
  ' && pass "Burst publish OK" || fail "Burst publish"

echo ""
echo "=== Waiting ${WAIT_SEC}s for drain ==="
for i in $(seq 1 "$WAIT_SEC"); do
  if [[ $((i % 15)) -eq 0 ]]; then
    echo "--- t=${i}s ---"
    list_depths "$RAB"
  fi
  sleep 1
done

echo ""
echo "=== Final queue depth ==="
FINAL="$(list_depths "$RAB")"
echo "$FINAL"

check_zero() {
  local q="$1"
  local line depth
  line="$(echo "$FINAL" | awk -v q="$q" '$1 == q {print; exit}')"
  if [[ -z "$line" ]]; then
    pass "$q (not listed — treat as 0)"
    return
  fi
  depth="$(echo "$line" | awk '{print $2}')"
  if [[ "${depth:-0}" -le 2 ]]; then
    pass "$q depth=${depth} (~0)"
  else
    fail "$q depth=${depth} (expected ~0)"
  fi
}

check_zero "voicehub.webhook.delivery"
check_zero "voicehub.notification.dispatch"

echo ""
echo "=== Worker replicas ==="
bash "$ROOT/devops/swarm/scale-workers.sh" status | head -20

echo ""
if [[ "$FAIL" -eq 0 ]]; then
  echo "P2 worker queue drain: PASSED"
  exit 0
fi
echo "P2 worker queue drain: FAILED"
exit 1
