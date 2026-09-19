const axios = require('axios');

/**
 * Callback stub → project-service (G20 handshake / run accepted notify).
 * Uses GATEWAY_INTERNAL_TOKEN; no-ops when PROJECT_SERVICE_URL unset.
 */

function projectBase() {
  return String(process.env.PROJECT_SERVICE_URL || '')
    .trim()
    .replace(/\/+$/, '');
}

function internalHeaders() {
  const token = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();
  if (!token) {
    const error = new Error('GATEWAY_INTERNAL_TOKEN is not set');
    error.code = 'NO_INTERNAL_TOKEN';
    throw error;
  }
  return {
    'Content-Type': 'application/json',
    'x-gateway-internal-token': token,
  };
}

function assertCallbackConfigured() {
  if (!projectBase()) {
    const error = new Error('PROJECT_SERVICE_URL unset');
    error.code = 'NO_PROJECT_URL';
    throw error;
  }
  internalHeaders();
  return true;
}

async function notifyRunAccepted(run) {
  const base = projectBase();
  if (!base) return { skipped: true, reason: 'PROJECT_SERVICE_URL unset' };
  // Stub path — project may not expose this yet
  try {
    await axios.post(
      `${base}/api/projects/internal/ai-planning/run-accepted`,
      { run },
      { headers: internalHeaders(), timeout: 5000, validateStatus: () => true }
    );
  } catch {
    /* ignore — callback best-effort */
  }
  return { skipped: false };
}

async function requestMaterializeApprovedPlan(payload) {
  const base = projectBase();
  if (!base) {
    const err = new Error('PROJECT_SERVICE_URL unset');
    err.code = 'NO_PROJECT_URL';
    throw err;
  }
  const res = await axios.post(
    `${base}/api/projects/internal/ai-planning/materialize`,
    payload,
    { headers: internalHeaders(), timeout: 30_000, validateStatus: () => true }
  );
  return { status: res.status, data: res.data };
}

async function notifyJobResult(payload) {
  assertCallbackConfigured();
  const base = projectBase();
  const response = await axios.post(
    `${base}/api/projects/internal/ai-planning/job-result`,
    payload,
    { headers: internalHeaders(), timeout: 15_000, validateStatus: () => true }
  );
  if (response.status >= 400) {
    const error = new Error(response.data?.message || 'Project result callback failed');
    error.code = response.data?.errorCode || 'PROJECT_CALLBACK_FAILED';
    error.statusCode = response.status;
    throw error;
  }
  if (response.data?.success !== true) {
    const error = new Error('Project result callback did not acknowledge the result');
    error.code = 'PROJECT_CALLBACK_NOT_ACKED';
    throw error;
  }
  return { status: response.status, data: response.data };
}

module.exports = {
  notifyRunAccepted,
  notifyJobResult,
  assertCallbackConfigured,
  requestMaterializeApprovedPlan,
};
