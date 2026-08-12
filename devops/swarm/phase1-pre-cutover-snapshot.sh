#!/usr/bin/env bash
# P1-Cutover — snapshot stack state trước cutover
# bash devops/swarm/phase1-pre-cutover-snapshot.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

STACK_NAME="${STACK_NAME:-voicehub}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="${PHASE1_SNAPSHOT_DIR:-backup/phase1-cutover-${STAMP}}"
mkdir -p "$OUT_DIR"

echo "Snapshot -> $OUT_DIR"

{
  echo "timestamp=$STAMP"
  echo "stack=$STACK_NAME"
  echo "git=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
} >"$OUT_DIR/meta.txt"

docker stack services "$STACK_NAME" >"$OUT_DIR/stack-services.txt" 2>&1 || true
docker stack ps "$STACK_NAME" --no-trunc >"$OUT_DIR/stack-tasks.txt" 2>&1 || true

for extra in voicehub-redis voicehub-rabbit; do
  if docker stack ls --format '{{.Name}}' | grep -qx "$extra"; then
    docker stack services "$extra" >"$OUT_DIR/${extra}-services.txt" 2>&1 || true
    docker stack ps "$extra" --no-trunc >"$OUT_DIR/${extra}-tasks.txt" 2>&1 || true
  fi
done

if [[ -f "$ROOT/.env" ]]; then
  grep -E '^(REDIS_|RABBITMQ_|MONGODB_URI|CHAT_MONGODB|AI_TASK_MONGODB|RABBITMQ_QUORUM)' "$ROOT/.env" \
    | sed -E 's/(mongodb\+srv:\/\/)[^@]+@/\1***@/; s/(amqp:\/\/)[^@]+@/\1***@/; s/(PASSWORD|PASS|PASS=)[^=]+/\1***/' \
    >"$OUT_DIR/env-infra-masked.txt" || true
fi

echo "[OK] Pre-cutover snapshot: $OUT_DIR"
echo "Tag checkpoint: git tag -a phase1-cutover-${STAMP} -m 'P1 cutover checkpoint'"
