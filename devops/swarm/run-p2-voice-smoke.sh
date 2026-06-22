#!/usr/bin/env bash
# P2-Voice — automated smoke (signaling, UDP host ports, label, restart)
# Manual 2-user audio: devops/swarm/voice-staging-smoke.md §B
# Usage: bash devops/swarm/run-p2-voice-smoke.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

BASE_URL="${BASE_URL:-http://localhost:3000}"
VOICE_DIRECT="${VOICE_DIRECT:-http://localhost:3005}"
SIGNAL_PATH="${VOICE_SIGNAL_PATH:-/voice-socket}"
FAIL=0

pass() { echo "[PASS] $1"; }
fail() { echo "[FAIL] $1"; FAIL=1; }
skip() { echo "[SKIP] $1"; }

echo "=== P2 Voice smoke (automated) ==="
echo "BASE_URL=$BASE_URL VOICE_DIRECT=$VOICE_DIRECT"

echo ""
echo "=== 1) Replica + placement ==="
VOICE_REP="$(docker service ls --filter name=voicehub_voice-service --format '{{.Replicas}}' 2>/dev/null || echo '?')"
echo "voicehub_voice-service replicas: $VOICE_REP"
if [[ "$VOICE_REP" == "1/1" ]]; then
  pass "VOICE_SERVICE_REPLICAS=1 running (staging decision)"
elif [[ "$VOICE_REP" == *"/1" && "${VOICE_REP%%/*}" -ge 1 ]]; then
  pass "At least one voice replica running ($VOICE_REP)"
else
  fail "Voice not running ($VOICE_REP) — see voice-staging-smoke.md prerequisites"
fi

VOICE_NODE="$(docker service ps voicehub_voice-service --filter desired-state=running --format '{{.Node}}' 2>/dev/null | head -1)"
if [[ -n "$VOICE_NODE" ]]; then
  pass "Voice task on node: $VOICE_NODE"
  NODE_ID="$(docker node ls --filter name="$VOICE_NODE" --format '{{.ID}}' 2>/dev/null | head -1)"
  if [[ -n "$NODE_ID" ]]; then
    VOICE_LABEL="$(docker node inspect "$NODE_ID" --format '{{index .Spec.Labels "voice"}}' 2>/dev/null || echo '')"
    if [[ "$VOICE_LABEL" == "true" ]]; then
      pass "node.labels.voice=true on $VOICE_NODE"
    else
      fail "Missing node.labels.voice=true on $VOICE_NODE (got: $VOICE_LABEL)"
    fi
  fi
else
  fail "No running voice task for label check"
fi

echo ""
echo "=== 2) Voice health (direct + via stack) ==="
if curl -sf -m 8 "${VOICE_DIRECT}/health" | grep -q '"service":"voice-service"'; then
  pass "GET ${VOICE_DIRECT}/health"
else
  fail "GET ${VOICE_DIRECT}/health"
fi

echo ""
echo "=== 3) Signaling via gateway (2 polling sessions) ==="
POLL_URL="${BASE_URL}${SIGNAL_PATH}/?EIO=4&transport=polling"
SID1="$(curl -sf -m 8 "$POLL_URL" 2>/dev/null | sed -n 's/^[0-9]\({"sid".*\)/\1/p' | head -1 || true)"
SID2="$(curl -sf -m 8 "$POLL_URL" 2>/dev/null | sed -n 's/^[0-9]\({"sid".*\)/\1/p' | head -1 || true)"
if [[ -n "$SID1" && -n "$SID2" ]]; then
  pass "Voice signaling polling via gateway ($SIGNAL_PATH)"
  ID1="$(echo "$SID1" | grep -o '"sid":"[^"]*"' | head -1 || true)"
  ID2="$(echo "$SID2" | grep -o '"sid":"[^"]*"' | head -1 || true)"
  if [[ -n "$ID1" && -n "$ID2" && "$ID1" != "$ID2" ]]; then
    pass "Two distinct Socket.IO session IDs (2-user signaling ready)"
  else
    fail "Could not confirm two distinct session IDs ($ID1 / $ID2)"
  fi
else
  fail "Voice signaling polling failed — check gateway voice proxy"
fi

echo ""
echo "=== 4) socket-service not public (S2) ==="
if curl -sf -m 2 "http://localhost:3017/health" >/dev/null 2>&1; then
  fail "socket-service reachable on :3017 — should be internal only"
else
  pass "socket-service not exposed on host :3017"
fi

echo ""
echo "=== 5) UDP host ports on running task ==="
VOICE_TASK="$(docker service ps voicehub_voice-service --filter desired-state=running --format '{{.ID}}' 2>/dev/null | head -1)"
if [[ -n "$VOICE_TASK" ]]; then
  PORTS="$(docker service ps voicehub_voice-service --filter desired-state=running --no-trunc --format '{{.Ports}}' 2>/dev/null | head -1)"
  if echo "$PORTS" | grep -q '40000/udp' && echo "$PORTS" | grep -q '40010/udp'; then
    pass "UDP host ports 40000-40010 published on task"
  else
    fail "Expected UDP 40000-40010 host ports, got: ${PORTS:-none}"
  fi
else
  fail "No running voice task for port check"
fi

echo ""
echo "=== 6) Voice task restart → health recover ==="
if [[ -n "${SKIP_VOICE_RESTART:-}" ]]; then
  skip "SKIP_VOICE_RESTART set"
else
  docker service update --force voicehub_voice-service >/dev/null 2>&1 || true
  echo "Waiting for voice-service rolling restart..."
  sleep 20
  VOICE_AFTER="$(docker service ls --filter name=voicehub_voice-service --format '{{.Replicas}}' 2>/dev/null || echo '?')"
  if [[ "$VOICE_AFTER" == "1/1" ]] && curl -sf -m 10 "${VOICE_DIRECT}/health" | grep -q '"status":"ok"'; then
    pass "Voice healthy after force update ($VOICE_AFTER)"
  else
    fail "Voice not healthy after restart ($VOICE_AFTER)"
  fi
fi

echo ""
echo "=== 7) Manual 2-user audio (operator) ==="
if [[ "${P2_VOICE_MANUAL_OK:-}" == "1" ]]; then
  pass "P2_VOICE_MANUAL_OK=1 — operator signed off 2-user audio (voice-staging-smoke.md §B)"
else
  skip "Complete manual 2-user call per devops/swarm/voice-staging-smoke.md §B, then: P2_VOICE_MANUAL_OK=1 bash devops/swarm/run-p2-voice-smoke.sh"
fi

echo ""
if [[ "$FAIL" -eq 0 ]]; then
  echo "P2 voice smoke (automated): PASSED"
  exit 0
fi
echo "P2 voice smoke (automated): FAILED"
exit 1
