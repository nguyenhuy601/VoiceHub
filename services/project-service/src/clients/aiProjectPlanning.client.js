const axios = require('axios');

/**
 * S2S client → ai-project-planning-service (RULE-11 remote planning).
 * Uses x-gateway-internal-token (= GATEWAY_INTERNAL_TOKEN).
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
  const res = await axios.post(`${base}/internal/runs`, payload, {
    headers: internalHeaders(),
    timeout: Number(process.env.AI_PLANNING_S2S_TIMEOUT_MS || 15000),
    validateStatus: () => true,
  });
  return { status: res.status, data: res.data };
}

async function getRun(runId) {
  const base = assertConfigured();
  const res = await axios.get(`${base}/internal/runs/${encodeURIComponent(String(runId))}`, {
    headers: internalHeaders(),
    timeout: 10000,
    validateStatus: () => true,
  });
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

module.exports = {
  startRun,
  getRun,
  cancelRun,
  resumeRun,
  planningBase,
  serializeRemoteRunInput,
};
