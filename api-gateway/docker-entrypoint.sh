#!/bin/sh
set -e
cd /app

if [ -f /shared/postinstall-link.cjs ]; then
  node /shared/postinstall-link.cjs
fi

exec "$@"
