#!/usr/bin/env bash
# Deploy Swarm stack from an immutable release manifest (no docker build).
#
# Usage:
#   bash devops/swarm/deploy-release.sh --manifest ./release-manifest.json [--env staging]
#   bash devops/swarm/deploy-release.sh --release-id R20261007-001 [--env staging]
#   bash devops/swarm/deploy-release.sh --release-id R100 --dry-run
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

MANIFEST=""
RELEASE_ID=""
ENV_NAME=""
DRY_RUN="false"
TMP_DIR=""

usage() {
  sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

cleanup() {
  [[ -n "${TMP_DIR}" && -d "${TMP_DIR}" ]] && rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

while [[ $# -gt 0 ]]; do
  case "$1" in
    --manifest) MANIFEST="${2:-}"; shift 2 ;;
    --release-id) RELEASE_ID="${2:-}"; shift 2 ;;
    --env) ENV_NAME="${2:-}"; shift 2 ;;
    --dry-run) DRY_RUN="true"; shift ;;
    -h|--help) usage 0 ;;
    *) echo "Unknown arg: $1" >&2; usage 1 ;;
  esac
done

if [[ -z "${MANIFEST}" && -n "${RELEASE_ID}" ]]; then
  TAG="voicehub-${RELEASE_ID}"
  TMP_DIR="$(mktemp -d)"
  if command -v gh >/dev/null 2>&1; then
    gh release download "${TAG}" --pattern release-manifest.json --dir "${TMP_DIR}"
    MANIFEST="${TMP_DIR}/release-manifest.json"
  else
    echo "[FAIL] --release-id requires gh CLI, or pass --manifest" >&2
    exit 1
  fi
fi

[[ -n "${MANIFEST}" && -f "${MANIFEST}" ]] || {
  echo "[FAIL] --manifest path required (or --release-id with gh)" >&2
  exit 1
}

# Resolve absolute path
MANIFEST="$(cd "$(dirname "${MANIFEST}")" && pwd)/$(basename "${MANIFEST}")"

MANIFEST_PATH="${MANIFEST}" ROOT_DIR="${ROOT}" node <<'NODE'
const fs = require('fs');
const path = require('path');
const root = process.env.ROOT_DIR;
const catalog = JSON.parse(
  fs.readFileSync(path.join(root, '.github/swarm-app-images.json'), 'utf8')
);
const m = JSON.parse(fs.readFileSync(process.env.MANIFEST_PATH, 'utf8'));
if (Object.keys(m.services || {}).length !== catalog.length) {
  console.error('Manifest must list', catalog.length, 'services');
  process.exit(1);
}
for (const row of catalog) {
  const s = m.services[row.image];
  if (!s?.digest || !String(s.digest).includes('@sha256:')) {
    console.error('Missing digest for', row.image);
    process.exit(1);
  }
}
console.log('[OK] manifest', m.releaseId, 'commit', m.commit);
NODE

export VOICEHUB_RELEASE_MANIFEST="${MANIFEST}"
if [[ -n "${ENV_NAME}" ]]; then
  export VOICEHUB_ENV_CHECK="${ENV_NAME}"
fi

echo "[INFO] VOICEHUB_RELEASE_MANIFEST=${VOICEHUB_RELEASE_MANIFEST}"
if [[ "${DRY_RUN}" == "true" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT/devops/swarm/resolve-swarm-images.sh"
  resolve_swarm_images
  echo "[DRY-RUN] Would deploy stack with images above — no docker build"
  exit 0
fi

bash "$ROOT/devops/swarm/deploy-stack.sh"
