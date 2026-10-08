const axios = require('axios');
const { withSafeGetRetry } = require('@enterprise/shared/http/s2sSafeGet');

/**
 * S2S client → ai-project-planning-service (RULE-11 remote planning).
 * Uses x-gateway-internal-token (= GATEWAY_INTERNAL_TOKEN).
 *
 * Retry ownership: GET uses withSafeGetRetry; POST startRun / cancel / resume
 * are NOT transport-retried (idempotency handled at APS / phase-run layer).
 */

function planningBase() {
  return String(process.env.AI_PROJECT_PLANNING_SERVICE_URL || '')
    .trim()
    .replace(/\/+$/, '');
}

function internalHeaders() {
  const token = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();
  if (!token) {
    const err = new Error('GATEWAY_INTERNAL_TOKEN is not set');
    err.code = 'NO_INTERNAL_TOKEN';
    throw err;
  }
  return {
    'Content-Type': 'application/json',
    'x-gateway-internal-token': token,
  };
}

function assertConfigured() {
  const base = planningBase();
  if (!base) {
    const err = new Error('AI_PROJECT_PLANNING_SERVICE_URL is not set');
    err.code = 'NO_PLANNING_URL';
    throw err;
  }
  return base;
}

function serializeRemoteRunInput(body = {}) {
  if (
    !body.input ||
    !body.input.container ||
    typeof body.input.container !== 'object' ||
    Array.isArray(body.input.container)
  ) {
    const error = new Error('Remote planning input.container is required');
    error.code = 'RUN_INPUT_REQUIRED';
    throw error;
  }
  return JSON.parse(JSON.stringify(body));
}

async function startRun(body) {
  const base = assertConfigured();
  const payload = serializeRemoteRunInput(body);
  if (body.idempotencyKey) {
    payload.idempotencyKey = String(body.idempotencyKey).trim();
  }
  if (body.requestKey) {
    payload.requestKey = String(body.requestKey).trim();
  }
  const res = await axios.post(`${base}/internal/runs`, payload, {
    headers: internalHeaders(),
    timeout: Number(process.env.AI_PLANNING_S2S_TIMEOUT_MS || 15000),
    validateStatus: () => true,
  });
  return { status: res.status, data: res.data };
}

async function getRun(runId, query = {}) {
  const base = assertConfigured();
  const params = {};
  if (query.rowOffset != null && query.rowOffset !== '') {
    params.rowOffset = query.rowOffset;
    params.rowLimit = query.rowLimit;
  }
  const res = await withSafeGetRetry(
    async () => {
      const r = await axios.get(
        `${base}/internal/runs/${encodeURIComponent(String(runId))}`,
        {
          headers: internalHeaders(),
          params,
          timeout: 10000,
          validateStatus: () => true,
        }
      );
      if (r.status === 429 || r.status >= 500) {
        const err = new Error(`planning getRun HTTP ${r.status}`);
        err.response = r;
        throw err;
      }
      return r;
    },
    { method: 'get' }
  );
  return { status: res.status, data: res.data };
}

async function cancelRun(runId) {
  const base = assertConfigured();
  const res = await axios.post(
    `${base}/internal/runs/${encodeURIComponent(String(runId))}/cancel`,
    {},
    { headers: internalHeaders(), timeout: 10000, validateStatus: () => true }
  );
  return { status: res.status, data: res.data };
}

async function resumeRun(runId, body = {}) {
  const base = assertConfigured();
  const res = await axios.post(
    `${base}/internal/runs/${encodeURIComponent(String(runId))}/resume`,
    body,
    { headers: internalHeaders(), timeout: 15000, validateStatus: () => true }
  );
  return { status: res.status, data: res.data };
}

/**
 * Gate2 Loop2 — submit planning feedback → selectiveReplan steps on checkpoint.
 */
async function submitFeedback(runId, body = {}) {
  const base = assertConfigured();
  const res = await axios.post(
    `${base}/internal/runs/${encodeURIComponent(String(runId))}/feedback`,
    body,
    { headers: internalHeaders(), timeout: 15000, validateStatus: () => true }
  );
  return { status: res.status, data: res.data };
}

module.exports = {
  startRun,
  getRun,
  cancelRun,
  resumeRun,
  submitFeedback,
  planningBase,
  serializeRemoteRunInput,
};
