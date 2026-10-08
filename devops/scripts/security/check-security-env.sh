#!/usr/bin/env bash
# Kiểm tra cấu hình env nguy hiểm trước deploy (CI guardrail + staging strict).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

fail=0
warn=0
PROFILE="${VOICEHUB_ENV_CHECK:-ci}"

DANGEROUS_PATTERNS=(
  'your-secret-key'
  'your-refresh-secret'
  'change-me'
  'your-webhook-secret'
)

check_file_rbac() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  if grep -qE '^RBAC_TEST_UNLOCK=true' "$file" 2>/dev/null; then
    echo "[FAIL] $file: RBAC_TEST_UNLOCK=true"
    fail=1
  fi
}

value_for_key() {
  local file="$1"
  local key="$2"
  [[ -f "$file" ]] || return 0
  grep -E "^${key}=" "$file" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true
}

is_dangerous() {
  local val="$1"
  local p
  [[ -z "$val" ]] && return 0
  for p in "${DANGEROUS_PATTERNS[@]}"; do
    if [[ "$val" == *"$p"* ]]; then
      return 0
    fi
  done
  if [[ "$val" == "password" ]] || [[ "$val" == "admin" ]]; then
    return 0
  fi
  return 1
}

check_secret_key() {
  local file="$1"
  local key="$2"
  local min_len="${3:-16}"
  local val
  val="$(value_for_key "$file" "$key")"
  if [[ -z "$val" ]]; then
    echo "[FAIL] $file: missing $key"
    fail=1
    return
  fi
  if is_dangerous "$val"; then
    echo "[FAIL] $file: $key uses default/weak value"
    fail=1
    return
  fi
  if [[ "${#val}" -lt "$min_len" ]]; then
    echo "[FAIL] $file: $key too short (min $min_len)"
    fail=1
  fi
}

check_staging_secrets() {
  local files=(
    ".env"
    "api-gateway/.env"
    "services/auth-service/.env"
  )

  echo "Staging strict check (VOICEHUB_ENV_CHECK=staging)..."

  for f in "${files[@]}"; do
    check_file_rbac "$f"
  done

  check_secret_key ".env" "GATEWAY_INTERNAL_TOKEN" 24
  check_secret_key ".env" "CHAT_INTERNAL_TOKEN" 24
  check_secret_key ".env" "REALTIME_INTERNAL_TOKEN" 24
  check_secret_key ".env" "NOTIFICATION_INTERNAL_TOKEN" 24
  check_secret_key ".env" "RABBITMQ_PASS" 16
  check_secret_key "api-gateway/.env" "JWT_SECRET" 32
  check_secret_key "api-gateway/.env" "GATEWAY_INTERNAL_TOKEN" 24
  check_secret_key "services/auth-service/.env" "JWT_SECRET" 32
  check_secret_key "services/auth-service/.env" "JWT_REFRESH_SECRET" 32

  local jwt_gw jwt_auth
  jwt_gw="$(value_for_key "api-gateway/.env" "JWT_SECRET")"
  jwt_auth="$(value_for_key "services/auth-service/.env" "JWT_SECRET")"
  if [[ -n "$jwt_gw" && -n "$jwt_auth" && "$jwt_gw" != "$jwt_auth" ]]; then
    echo "[FAIL] JWT_SECRET mismatch between api-gateway and auth-service"
    fail=1
  fi

  local gw_root gw_api
  gw_root="$(value_for_key ".env" "GATEWAY_INTERNAL_TOKEN")"
  gw_api="$(value_for_key "api-gateway/.env" "GATEWAY_INTERNAL_TOKEN")"
  if [[ -n "$gw_root" && -n "$gw_api" && "$gw_root" != "$gw_api" ]]; then
    echo "[WARN] GATEWAY_INTERNAL_TOKEN mismatch root vs api-gateway"
    warn=1
  fi

  sync_token_across_envs() {
    local key="$1"
    local root_val file_val
    root_val="$(value_for_key ".env" "$key")"
    [[ -z "$root_val" ]] && return 0
    for f in \
      "services/socket-service/.env" \
      "services/chat-service/.env" \
      "services/notification-service/.env" \
      "services/project-service/.env"; do
      [[ -f "$f" ]] || continue
      file_val="$(value_for_key "$f" "$key")"
      if [[ -n "$file_val" && "$file_val" != "$root_val" ]]; then
        echo "[FAIL] $key mismatch: root .env vs $f"
        fail=1
      fi
    done
  }

  sync_token_across_envs "REALTIME_INTERNAL_TOKEN"
  sync_token_across_envs "CHAT_INTERNAL_TOKEN"

  local chat_socket_flag
  chat_socket_flag="$(value_for_key "services/chat-service/.env" "CHAT_SOCKET_ENABLED")"
  if [[ "$chat_socket_flag" == "true" ]] || [[ "$chat_socket_flag" == "1" ]]; then
    echo "[WARN] services/chat-service/.env: CHAT_SOCKET_ENABLED=true — legacy chat Socket.IO; canonical is socket-service"
    warn=1
  fi

  local socket_replicas socket_adapter
  socket_replicas="$(value_for_key ".env" "SOCKET_SERVICE_REPLICAS")"
  socket_adapter="$(value_for_key ".env" "SOCKET_IO_REDIS_ADAPTER")"
  if [[ -n "$socket_replicas" ]] && [[ "$socket_replicas" =~ ^[0-9]+$ ]] && [[ "$socket_replicas" -lt 2 ]]; then
    echo "[WARN] .env: SOCKET_SERVICE_REPLICAS=$socket_replicas — S3 staging expects >= 2"
    warn=1
  fi
  if [[ "$socket_adapter" == "false" ]] || [[ "$socket_adapter" == "0" ]]; then
    echo "[WARN] .env: SOCKET_IO_REDIS_ADAPTER=false — multi-replica socket needs Redis adapter"
    warn=1
  fi

  if grep -qE '^NODE_ENV=production' "api-gateway/.env" 2>/dev/null; then
    if [[ -z "$(value_for_key "api-gateway/.env" "GATEWAY_INTERNAL_TOKEN")" ]]; then
      echo "[FAIL] api-gateway/.env: GATEWAY_INTERNAL_TOKEN required when NODE_ENV=production"
      fail=1
    fi
  fi
}

check_ci_minimal() {
  for f in \
    services/role-permission-service/.env \
    .env; do
    check_file_rbac "$f"
  done

  if [[ "${NODE_ENV:-}" == "production" ]] && [[ "${RBAC_TEST_UNLOCK:-}" == "true" ]]; then
    echo "[FAIL] NODE_ENV=production with RBAC_TEST_UNLOCK=true"
    fail=1
  fi
}

case "$PROFILE" in
  staging|production)
    check_staging_secrets
    ;;
  ci|*)
    check_ci_minimal
    if [[ -f ".env" ]] && grep -qE 'change-me|your-secret-key' ".env" 2>/dev/null; then
      echo "[WARN] .env contains dev placeholder secrets — run rotate-staging-secrets before staging deploy"
      warn=1
    fi
    ;;
esac

if [[ "$fail" -ne 0 ]]; then
  echo "Security env check failed."
  exit 1
fi

if [[ "$warn" -ne 0 ]]; then
  echo "Security env check passed with warnings."
else
  echo "Security env check passed."
fi
