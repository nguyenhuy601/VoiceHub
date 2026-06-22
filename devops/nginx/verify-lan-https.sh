#!/usr/bin/env bash
# LAN HTTPS verify (curl) — tương đương verify-lan-https.ps1
# Usage: bash devops/nginx/verify-lan-https.sh [https://voicehub.local]
set -euo pipefail

BASE_URL="${1:-https://voicehub.local}"
CURL_OPTS=(-skf -m 20)

echo "=== VoiceHub LAN HTTPS Verify (bash) ==="
echo "BaseUrl: $BASE_URL"

check_http() {
  local name="$1" url="$2"
  echo "[check] $name -> $url"
  local code
  code="$(curl "${CURL_OPTS[@]}" -o /dev/null -w '%{http_code}' "$url" || echo 000)"
  if [[ "$code" == "200" ]]; then
    echo "  OK ($code)"
  else
    echo "  FAIL (HTTP $code)" >&2
    exit 1
  fi
}

check_socket_polling() {
  local path="$1"
  local url="${BASE_URL}${path}/?EIO=4&transport=polling"
  echo "[check] Socket polling -> $url"
  local body
  body="$(curl "${CURL_OPTS[@]}" "$url" || true)"
  if echo "$body" | grep -q '"sid"'; then
    echo "  OK (sid found)"
  else
    echo "  FAIL (no sid in response)" >&2
    exit 1
  fi
}

check_http "Frontend or redirect" "$BASE_URL/"
check_http "Gateway health" "$BASE_URL/api/health/gateway-trust"
check_socket_polling "/socket.io"
check_socket_polling "/voice-socket"

echo "All checks passed."
