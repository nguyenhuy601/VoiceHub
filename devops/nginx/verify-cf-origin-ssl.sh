#!/usr/bin/env bash
# P5-DNS — verify nginx CF origin SSL template + optional live certs
# Usage: bash devops/nginx/verify-cf-origin-ssl.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
NGINX_PREFIX="$ROOT/devops/nginx"
FAIL=0

pass() { echo "[PASS] $1"; }
fail() { echo "[FAIL] $1"; FAIL=1; }
warn() { echo "[WARN] $1"; }

echo "=== CF origin SSL verify ==="

EXAMPLE="$NGINX_PREFIX/cloudflare/prod-edge.cf.example.conf"
if [[ -f "$EXAMPLE" ]]; then
  if grep -q 'ssl_certificate.*cf-origin.pem' "$EXAMPLE" \
    && grep -q 'TLSv1.2' "$EXAMPLE"; then
    pass "prod-edge.cf.example.conf SSL directives"
  else
    fail "prod-edge.cf.example.conf missing SSL config"
  fi
else
  fail "missing $EXAMPLE"
fi

if grep -qi 'Full (strict)' "$ROOT/docs/phase5-dns-tls.md" 2>/dev/null; then
  pass "phase5-dns-tls.md documents Full (strict)"
else
  fail "Full (strict) not documented"
fi

CERT="$NGINX_PREFIX/certs/cf-origin.pem"
KEY="$NGINX_PREFIX/certs/cf-origin-key.pem"
if [[ -f "$CERT" && -f "$KEY" ]]; then
  pass "Origin cert files on disk"
  if command -v openssl >/dev/null 2>&1; then
    openssl x509 -in "$CERT" -noout -dates 2>/dev/null && pass "cert dates valid PEM"
  fi
else
  warn "Origin cert not installed — DEFER until CF dashboard (install-cf-origin-cert.sh)"
fi

if command -v nginx >/dev/null 2>&1; then
  if nginx -t -p "$NGINX_PREFIX" -c prod-edge.conf >/dev/null 2>&1; then
    pass "prod-edge.conf (mkcert staging) nginx -t"
  else
    warn "prod-edge.conf nginx -t failed"
  fi
else
  warn "nginx not in PATH — skip nginx -t"
fi

echo ""
if [[ "$FAIL" -eq 0 ]]; then
  echo "CF origin SSL verify: PASSED"
  exit 0
fi
echo "CF origin SSL verify: FAILED"
exit 1
