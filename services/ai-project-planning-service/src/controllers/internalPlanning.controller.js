const { randomUUID } = require('node:crypto');
const {
  createQueuedRun,
  getRunById,
  cancelRun: cancelRunStore,
  resumeRun: resumeRunStore,
  toPublicRun,
} = require('../run/runStore');
const { parseFeedback } = require('../feedback/feedbackParser');
const { saveCheckpoint } = require('../checkpoint/checkpointStore');
const { runPlanningGraph } = require('../orchestration/planningGraph');
const { PlanningRun } = require('../run/PlanningRun.model');
const {
  assertCallbackConfigured,
  notifyRunAccepted,
  notifyJobResult,
} = require('../clients/project.client');
const { HOW_JOBS, runHowJob } = require('../engines/howJobRunner');

const MAX_ARRAY_ITEMS = 2000;
const MAX_EMPLOYEES = 200;
const MAX_OBJECT_KEYS = 2000;
const MAX_IDENTIFIER_LENGTH = 128;
const MAX_REQUEST_KEY_LENGTH = 256;
const EXECUTION_MAX_ATTEMPTS = 3;
const EXECUTION_LEASE_MS = 30 * 60 * 1000;
const CALLBACK_MAX_ATTEMPTS = 5;
const CALLBACK_BASE_DELAY_MS = 1000;
const CALLBACK_LEASE_MS = 60 * 1000;

function assertPlainObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    const error = new Error(`${field} must be a non-null object`);
    error.code = 'RUN_INPUT_INVALID';
    throw error;
  }
}

function assertBoundedInput(value, path = 'input', seen = new Set(), depth = 0) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  if (depth > 20) {
    const error = new Error(`${path} exceeds maximum nesting depth`);
    error.code = 'RUN_INPUT_TOO_LARGE';
    throw error;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ITEMS) {
      const error = new Error(`${path} exceeds ${MAX_ARRAY_ITEMS} items`);
      error.code = 'RUN_INPUT_TOO_LARGE';
      throw error;
    }
    value.forEach((item, index) =>
      assertBoundedInput(item, `${path}[${index}]`, seen, depth + 1)
    );
    return;
  }
  const entries = Object.entries(value);
  if (entries.length > MAX_OBJECT_KEYS) {
    const error = new Error(`${path} exceeds ${MAX_OBJECT_KEYS} object keys`);
    error.code = 'RUN_INPUT_TOO_LARGE';
    throw error;
  }
  for (const [key, child] of entries) {
    if (key.length > MAX_IDENTIFIER_LENGTH) {
      const error = new Error(`${path} contains an oversized object key`);
      error.code = 'RUN_INPUT_TOO_LARGE';
      throw error;
    }
    assertBoundedInput(child, `${path}.${key}`, seen, depth + 1);
  }
}

function validateStartBody(body) {
  const required = ['packId', 'organizationId', 'snapshotId'];
  for (const field of required) {
    const value = String(body[field] || '').trim();
    if (!value) {
      const error = new Error(`${field} is required`);
      error.code = 'RUN_IDENTIFIERS_REQUIRED';
      throw error;
    }
    if (value.length > MAX_IDENTIFIER_LENGTH) {
      const error = new Error(`${field} exceeds ${MAX_IDENTIFIER_LENGTH} characters`);
      error.code = 'RUN_IDENTIFIERS_INVALID';
      throw error;
    }
  }
  for (const [field, maxLength] of [
    ['projectId', MAX_IDENTIFIER_LENGTH],
    ['initiatedBy', MAX_IDENTIFIER_LENGTH],
    ['approvedSrsVersion', MAX_IDENTIFIER_LENGTH],
    ['snapshotPayloadRef', 256],
  ]) {
    if (
      body[field] != null &&
      String(body[field]).trim().length > maxLength
    ) {
      const error = new Error(`${field} exceeds ${maxLength} characters`);
      error.code = 'RUN_IDENTIFIERS_INVALID';
      throw error;
    }
  }
  const job = String(body.job || '').trim();
  if (!HOW_JOBS.has(job)) {
    const error = new Error(`Unsupported deterministic HOW job: ${job}`);
    error.code = 'HOW_JOB_UNSUPPORTED';
    throw error;
  }
  if (body.runId != null && !/^[a-f\d]{24}$/i.test(String(body.runId))) {
    const error = new Error('runId must be a 24-character hexadecimal id');
    error.code = 'RUN_ID_INVALID';
    throw error;
  }
  if (
    body.requestKey != null &&
    String(body.requestKey).length > MAX_REQUEST_KEY_LENGTH
  ) {
    const error = new Error(`requestKey exceeds ${MAX_REQUEST_KEY_LENGTH} characters`);
    error.code = 'RUN_IDENTIFIERS_INVALID';
    throw error;
  }
  assertPlainObject(body.input, 'input');
  assertPlainObject(body.input.container, 'input.container');
  if (body.input.pack != null) assertPlainObject(body.input.pack, 'input.pack');
  if (body.input.toolData != null) assertPlainObject(body.input.toolData, 'input.toolData');
  const employees = body.input.toolData?.employees;
  if (employees != null && (!Array.isArray(employees) || employees.length > MAX_EMPLOYEES)) {
    const error = new Error(`input.toolData.employees must contain at most ${MAX_EMPLOYEES} items`);
    error.code = 'RUN_INPUT_TOO_LARGE';
    throw error;
  }
  assertBoundedInput(body.input);
  assertCallbackConfigured();
  return job;
}

/**
 * POST /internal/runs — 202 { runId, status }
 */
async function startRun(req, res) {
  try {
    const body = req.body || {};
    const snapshotId = String(body.snapshotId || '').trim();
    const job = validateStartBody(body);

    const doc = await createQueuedRun({
      runId: body.runId,
      projectId: body.projectId,
      packId: body.packId,
      organizationId: body.organizationId,
      snapshotId,
      approvedSrsVersion: body.approvedSrsVersion,
      snapshotPayloadRef: body.snapshotPayloadRef || body.snapshot?.ref,
      trigger: body.trigger || 'manual',
      initiatedBy: body.initiatedBy,
      job,
      input: body.input,
      idempotencyKey:
        body.requestKey ||
        `${String(body.packId)}:${job}:${snapshotId}:${String(
          body.input?.inputFingerprint || ''
        )}`,
    });

    const publicRun = toPublicRun(doc);
    // Acceptance notification is advisory; final job-result callback is authoritative.
    notifyRunAccepted(publicRun).catch(() => {});

    // Execute from the persisted immutable input without blocking the 202 response.
    setImmediate(() => {
      processRunAsync(String(doc._id)).catch((err) => {
        console.error('[planning] processRunAsync', err?.message || err);
      });
    });

    return res.status(202).json({
      success: true,
      runId: publicRun.runId,
      status: publicRun.status,
      data: publicRun,
    });
  } catch (err) {
    const status =
      err.code === 'ACTIVE_RUN_EXISTS'
        ? 409
        : [
              'SNAPSHOT_REQUIRED',
              'RUN_IDENTIFIERS_REQUIRED',
              'RUN_IDENTIFIERS_INVALID',
              'HOW_JOB_UNSUPPORTED',
              'RUN_INPUT_REQUIRED',
              'RUN_INPUT_INVALID',
              'RUN_INPUT_TOO_LARGE',
              'RUN_ID_INVALID',
              'NO_PROJECT_URL',
              'NO_INTERNAL_TOKEN',
            ].includes(err.code)
          ? 400
          : 500;
    return res.status(status).json({
      success: false,
      message: err.message || 'start run failed',
      errorCode: err.code || 'START_RUN_FAILED',
    });
  }
}

function callbackDelayMs(attempt) {
  return Math.min(30_000, CALLBACK_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1));
}

function scheduleCallbackDelivery(runId, retryAt = new Date()) {
  const delayMs = Math.max(0, new Date(retryAt).getTime() - Date.now());
  const timer = setTimeout(() => {
    deliverRunCallback(runId).catch((error) => {
      console.error('[planning] callback retry', error?.message || error);
    });
  }, delayMs);
  timer.unref?.();
}

async function deliverRunCallback(
  runId,
  {
    notify = notifyJobResult,
    scheduleRetry = true,
    maxAttempts = CALLBACK_MAX_ATTEMPTS,
  } = {}
) {
  const now = new Date();
  const leaseOwner = `callback:${randomUUID()}`;
  const run = await PlanningRun.findOneAndUpdate(
    {
      _id: runId,
      status: 'callback_pending',
      callbackPayload: { $ne: null },
      callbackAttempts: { $lt: maxAttempts },
      $or: [
        { callbackNextRetryAt: { $lte: now } },
        { callbackNextRetryAt: null },
      ],
    },
    {
      $set: {
        status: 'callback_delivering',
        currentNode: 'callback_delivering',
        callbackLeaseOwner: leaseOwner,
        callbackLeaseExpiresAt: new Date(now.getTime() + CALLBACK_LEASE_MS),
      },
      $inc: { callbackAttempts: 1 },
    },
    { new: true }
  ).lean();
  if (!run) return getRunById(runId);
  const attempt = Number(run.callbackAttempts || 0);
  try {
    await notify(run.callbackPayload);
    const finalStatus =
      run.callbackPayload.status === 'completed' ? 'completed' : 'failed';
    return PlanningRun.findOneAndUpdate(
      {
        _id: runId,
        status: 'callback_delivering',
        callbackLeaseOwner: leaseOwner,
      },
      {
        $set: {
          status: finalStatus,
          currentNode: finalStatus,
          completedAt: new Date(),
          callbackAckedAt: new Date(),
          callbackNextRetryAt: null,
          callbackLastError: null,
          callbackLeaseOwner: null,
          callbackLeaseExpiresAt: null,
          error:
            finalStatus === 'failed'
              ? run.callbackPayload.error || run.error
              : null,
        },
        $unset: { activeKey: 1 },
      },
      { new: true }
    ).lean();
  } catch (error) {
    const errorPatch = {
      code: error.code || 'PROJECT_CALLBACK_FAILED',
      message: error.message,
      statusCode: error.statusCode || null,
    };
    if (attempt >= maxAttempts) {
      return PlanningRun.findOneAndUpdate(
        {
          _id: runId,
          status: 'callback_delivering',
          callbackLeaseOwner: leaseOwner,
        },
        {
          $set: {
            status: 'failed',
            currentNode: 'callback_failed',
            completedAt: new Date(),
            callbackNextRetryAt: null,
            callbackLastError: errorPatch,
            callbackLeaseOwner: null,
            callbackLeaseExpiresAt: null,
            error: {
              code: 'CALLBACK_RETRY_EXHAUSTED',
              message: 'Authoritative project callback was not acknowledged',
            },
          },
          $unset: { activeKey: 1 },
        },
        { new: true }
      ).lean();
    }
    const delayMs = callbackDelayMs(attempt);
    const nextRetryAt = new Date(Date.now() + delayMs);
    const pending = await PlanningRun.findOneAndUpdate(
      {
        _id: runId,
        status: 'callback_delivering',
        callbackLeaseOwner: leaseOwner,
      },
      {
        $set: {
          status: 'callback_pending',
          currentNode: 'callback_pending',
          callbackNextRetryAt: nextRetryAt,
          callbackLastError: errorPatch,
          callbackLeaseOwner: null,
          callbackLeaseExpiresAt: null,
        },
      },
      { new: true }
    ).lean();
    if (pending && scheduleRetry) scheduleCallbackDelivery(runId, nextRetryAt);
    return getRunById(runId);
  }
}

async function stageCallback(run, executionLeaseOwner, payload, patch = {}) {
  const staged = await PlanningRun.findOneAndUpdate(
    {
      _id: run._id,
      status: 'running',
      executionLeaseOwner,
    },
    {
      $set: {
        status: 'callback_pending',
        currentNode: 'callback_pending',
        callbackPayload: payload,
        callbackAttempts: 0,
        callbackNextRetryAt: new Date(),
        callbackLastError: null,
        executionLeaseOwner: null,
        executionLeaseExpiresAt: null,
        ...patch,
      },
    },
    { new: true }
  ).lean();
  if (!staged) return getRunById(String(run._id));
  return deliverRunCallback(String(run._id));
}

async function claimRunExecution(
  runId,
  {
    now = new Date(),
    executionLeaseOwner = `execution:${randomUUID()}`,
  } = {}
) {
  const run = await PlanningRun.findOneAndUpdate(
    {
      _id: runId,
      attempt: { $lt: EXECUTION_MAX_ATTEMPTS },
      $or: [
        { status: 'queued' },
        {
          status: 'running',
          executionLeaseExpiresAt: { $lte: now },
        },
      ],
    },
    {
      $set: {
        status: 'running',
        currentNode: 'execute_how',
        startedAt: now,
        executionClaimedAt: now,
        executionLeaseOwner,
        executionLeaseExpiresAt: new Date(now.getTime() + EXECUTION_LEASE_MS),
      },
      $inc: { attempt: 1 },
    },
    { new: true }
  ).lean();
  return run ? { run, executionLeaseOwner } : null;
}

async function processRunAsync(runId, { runJob = runHowJob } = {}) {
  const claim = await claimRunExecution(runId);
  const claimed = claim?.run;
  if (!claimed) return;
  const run = claimed;
  const { executionLeaseOwner } = claim;

  if (HOW_JOBS.has(run.job)) {
    try {
      const output = await runJob({
        job: run.job,
        container: run.input?.container,
        pack: run.input?.pack,
        toolData: run.input?.toolData,
        snapshotId: run.snapshotId,
      });
      const callbackPayload = {
        runId,
        status: 'completed',
        job: run.job,
        projectId: run.projectId,
        packId: run.packId,
        organizationId: run.organizationId,
        snapshotId: run.snapshotId,
        result: output,
      };
      await stageCallback(run, executionLeaseOwner, callbackPayload, {
        result: output,
        evidence: output.evidence,
        error: null,
        checkpoint: {
          state: { job: run.job, output },
          savedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      const callbackError = {
        code: error.code || 'HOW_JOB_FAILED',
        message: error.message,
      };
      await stageCallback(
        run,
        executionLeaseOwner,
        {
          runId,
          status: 'failed',
          job: run.job,
          projectId: run.projectId,
          packId: run.packId,
          organizationId: run.organizationId,
          snapshotId: run.snapshotId,
          error: callbackError,
        },
        { error: callbackError }
      );
    }
    return;
  }

  const graphState = await runPlanningGraph({
    runId,
    snapshotId: run.snapshotId,
  });

  const feasPass = graphState.feasibility?.pass !== false;
  await PlanningRun.findOneAndUpdate(
    {
      _id: runId,
      status: 'running',
      executionLeaseOwner,
    },
    {
      $set: {
        status: feasPass ? 'waiting_human' : 'failed',
        currentNode: 'feasibility',
        checkpoint: {
          state: graphState,
          savedAt: new Date().toISOString(),
        },
        executionLeaseOwner: null,
        executionLeaseExpiresAt: null,
        error: feasPass ? null : { feasibility: graphState.feasibility },
        ...(!feasPass ? { completedAt: new Date() } : {}),
      },
      ...(!feasPass ? { $unset: { activeKey: 1 } } : {}),
    },
    { new: true }
  ).lean();
}

async function recoverExpiredCallbackLeases(now = new Date()) {
  const exhausted = await PlanningRun.updateMany(
    {
      status: 'callback_delivering',
      callbackLeaseExpiresAt: { $lte: now },
      callbackAttempts: { $gte: CALLBACK_MAX_ATTEMPTS },
    },
    {
      $set: {
        status: 'failed',
        currentNode: 'callback_failed',
        completedAt: now,
        callbackNextRetryAt: null,
        callbackLeaseOwner: null,
        callbackLeaseExpiresAt: null,
        error: {
          code: 'CALLBACK_RETRY_EXHAUSTED',
          message: 'Authoritative project callback was not acknowledged',
        },
      },
      $unset: { activeKey: 1 },
    }
  );
  const recovered = await PlanningRun.updateMany(
    {
      status: 'callback_delivering',
      callbackLeaseExpiresAt: { $lte: now },
      callbackAttempts: { $lt: CALLBACK_MAX_ATTEMPTS },
    },
    {
      $set: {
        status: 'callback_pending',
        currentNode: 'callback_pending',
        callbackNextRetryAt: now,
        callbackLeaseOwner: null,
        callbackLeaseExpiresAt: null,
      },
    }
  );
  return {
    exhaustedCount: exhausted.modifiedCount || 0,
    recoveredCount: recovered.modifiedCount || 0,
  };
}

async function recoverRunsOnStartup() {
  const now = new Date();
  await recoverExpiredCallbackLeases(now);
  await PlanningRun.updateMany(
    {
      status: 'running',
      executionLeaseExpiresAt: { $lte: now },
      attempt: { $gte: EXECUTION_MAX_ATTEMPTS },
    },
    {
      $set: {
        status: 'failed',
        currentNode: 'execution_failed',
        completedAt: now,
        executionLeaseOwner: null,
        executionLeaseExpiresAt: null,
        error: {
          code: 'EXECUTION_RETRY_EXHAUSTED',
          message: 'Execution lease expired too many times',
        },
      },
      $unset: { activeKey: 1 },
    }
  );

  const callbackRuns = await PlanningRun.find({
    status: 'callback_pending',
    callbackAttempts: { $lt: CALLBACK_MAX_ATTEMPTS },
  })
    .select({ _id: 1, callbackNextRetryAt: 1 })
    .lean();
  for (const run of callbackRuns) {
    scheduleCallbackDelivery(String(run._id), run.callbackNextRetryAt || now);
  }

  const executionRuns = await PlanningRun.find({
    attempt: { $lt: EXECUTION_MAX_ATTEMPTS },
    $or: [
      { status: 'queued' },
      {
        status: 'running',
        executionLeaseExpiresAt: { $lte: now },
      },
    ],
  })
    .select({ _id: 1 })
    .lean();
  for (const run of executionRuns) {
    setImmediate(() => {
      processRunAsync(String(run._id)).catch((error) => {
        console.error('[planning] resume execution', error?.message || error);
      });
    });
  }
  return {
    callbackCount: callbackRuns.length,
    executionCount: executionRuns.length,
  };
}

async function getRun(req, res) {
  try {
    const doc = await getRunById(req.params.runId);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Run not found' });
    }
    return res.json({ success: true, data: toPublicRun(doc) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function cancelRun(req, res) {
  try {
    const doc = await cancelRunStore(req.params.runId);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Run not found' });
    }
    return res.json({ success: true, data: toPublicRun(doc) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function resumeRun(req, res) {
  try {
    const doc = await resumeRunStore(req.params.runId);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Run not found' });
    }
    const runId = String(doc._id || doc.runId);
    setImmediate(() => {
      const work = doc.callbackPayload
        ? deliverRunCallback(runId)
        : processRunAsync(runId);
      work.catch(() => {});
    });
    return res.status(202).json({ success: true, data: toPublicRun(doc) });
  } catch (err) {
    const status = err.code === 'RESUME_DENIED' ? 409 : 500;
    return res.status(status).json({
      success: false,
      message: err.message,
      errorCode: err.code,
    });
  }
}

async function submitFeedback(req, res) {
  try {
    const runId = req.params.runId;
    const existing = await PlanningRun.findById(runId);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Run not found' });
    }

    const parsed = parseFeedback(req.body || {});
    existing.lastFeedback = parsed;
    existing.status = 'replanning';
    await existing.save();

    await saveCheckpoint(runId, {
      ...(existing.checkpoint?.state || {}),
      lastFeedback: parsed,
    });

    return res.json({
      success: true,
      data: {
        runId: String(existing._id),
        status: existing.status,
        feedback: parsed,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = {
  startRun,
  getRun,
  cancelRun,
  resumeRun,
  submitFeedback,
  processRunAsync,
  validateStartBody,
  deliverRunCallback,
  callbackDelayMs,
  recoverRunsOnStartup,
  scheduleCallbackDelivery,
  claimRunExecution,
  recoverExpiredCallbackLeases,
};
