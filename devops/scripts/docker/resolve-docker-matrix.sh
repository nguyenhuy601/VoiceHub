#!/usr/bin/env bash
# Resolve Swarm app Docker build matrix (PR verify + main publish).
# Usage:
#   bash devops/scripts/docker/resolve-docker-matrix.sh \
#     --event pr|push \
#     [--base <sha>] [--head <sha>] \
#     [--force-all] [--image <name>] \
#     [--github-output]
#
# Prints matrix JSON to stdout; with --github-output also writes GITHUB_OUTPUT.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
EVENT=""
BASE=""
HEAD="HEAD"
FORCE_ALL="false"
IMAGE=""
GITHUB_OUTPUT_FLAG="false"

usage() {
  sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --event) EVENT="${2:-}"; shift 2 ;;
    --base) BASE="${2:-}"; shift 2 ;;
    --head) HEAD="${2:-}"; shift 2 ;;
    --force-all) FORCE_ALL="true"; shift ;;
    --image) IMAGE="${2:-}"; shift 2 ;;
    --github-output) GITHUB_OUTPUT_FLAG="true"; shift ;;
    -h|--help) usage 0 ;;
    *) echo "Unknown arg: $1" >&2; usage 1 ;;
  esac
done

[[ -n "${EVENT}" ]] || { echo "--event required (pr|push)" >&2; exit 1; }

IMAGES_FILE="${ROOT}/.github/swarm-app-images.json"
[[ -f "${IMAGES_FILE}" ]] || { echo "Missing ${IMAGES_FILE}" >&2; exit 1; }

# Collect changed paths (empty if force-all / no base)
CHANGED_FILE="$(mktemp)"
cleanup() { rm -f "${CHANGED_FILE}"; }
trap cleanup EXIT

FORCE_SHARED_DOCKER="false"
if [[ "${FORCE_ALL}" != "true" && -z "${IMAGE}" && -n "${BASE}" ]]; then
  if git -C "${ROOT}" rev-parse --verify "${BASE}" >/dev/null 2>&1; then
    git -C "${ROOT}" diff --name-only "${BASE}" "${HEAD}" > "${CHANGED_FILE}" || true
    if git -C "${ROOT}" diff --name-only "${BASE}" "${HEAD}" -- \
      shared/ \
      .github/swarm-app-images.json \
      .github/workflows/ci.yml \
      .github/workflows/cd.yml \
      'api-gateway/Dockerfile' \
      'services/*/Dockerfile' | grep -q .; then
      FORCE_SHARED_DOCKER="true"
    fi
  else
    echo "Base ${BASE} not found; building all" >&2
    FORCE_ALL="true"
  fi
elif [[ -z "${IMAGE}" && -z "${BASE}" && "${FORCE_ALL}" != "true" ]]; then
  echo "No --base; building all images" >&2
  FORCE_ALL="true"
fi

RESULT="$(
  FORCE_ALL="${FORCE_ALL}" \
  FORCE_SHARED_DOCKER="${FORCE_SHARED_DOCKER}" \
  IMAGE="${IMAGE}" \
  IMAGES_FILE="${IMAGES_FILE}" \
  CHANGED_FILE="${CHANGED_FILE}" \
  EVENT="${EVENT}" \
  node <<'NODE'
const fs = require('fs');
const catalog = JSON.parse(fs.readFileSync(process.env.IMAGES_FILE, 'utf8'));
const forceAll = process.env.FORCE_ALL === 'true' || process.env.FORCE_SHARED_DOCKER === 'true';
const onlyImage = (process.env.IMAGE || '').trim();
const event = process.env.EVENT;

let selected = catalog;
if (onlyImage) {
  selected = catalog.filter((x) => x.image === onlyImage);
  if (!selected.length) {
    console.error(`Unknown image: ${onlyImage}`);
    process.exit(1);
  }
} else if (!forceAll) {
  const changed = fs.existsSync(process.env.CHANGED_FILE)
    ? fs.readFileSync(process.env.CHANGED_FILE, 'utf8').split(/\r?\n/).filter(Boolean)
    : [];
  selected = catalog.filter((row) => {
    if (row.image === 'api-gateway') {
      return changed.some((p) => p.startsWith('api-gateway/'));
    }
    return changed.some((p) => p.startsWith(`services/${row.image}/`));
  });
  if (forceAll === false && process.env.FORCE_SHARED_DOCKER === 'true') {
    // unreachable — handled above
  }
  console.error(
    selected.length
      ? `path matrix (${event}): ${selected.map((s) => s.image).join(', ')}`
      : `path matrix (${event}): empty`
  );
} else {
  console.error(`build all (${event})`);
}

const hasImages = selected.length > 0;
const matrix = JSON.stringify({ include: selected });
process.stdout.write(`${matrix}\n${hasImages ? 'true' : 'false'}\n`);
NODE
)"

MATRIX="$(echo "${RESULT}" | head -n 1)"
HAS_IMAGES="$(echo "${RESULT}" | tail -n 1)"

echo "${MATRIX}"
if [[ "${GITHUB_OUTPUT_FLAG}" == "true" ]]; then
  {
    echo "matrix=${MATRIX}"
    echo "has_images=${HAS_IMAGES}"
  } >> "${GITHUB_OUTPUT:?GITHUB_OUTPUT not set}"
fi
