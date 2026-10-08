const { randomUUID } = require('node:crypto');
const {
  createQueuedRun,
  getRunById,
  cancelRun: cancelRunStore,
  resumeRun: resumeRunStore,
  toPublicRun,
} = require('../run/runStore');
const { parseFeedback } = require('../feedback/feedbackParser');
const {
  saveCheckpoint,
  loadCheckpoint,
  deleteCheckpoint,
  assertCheckpointForResume,
} = require('../checkpoint/checkpointStore');
const { clearCheckpointIfTerminal } = require('../checkpoint/checkpointLifecycle');
const {
  buildLoop1ChildHistory,
  buildLoop2ReplanHistory,
  hasLoop1ChildTriad,
  FEEDBACK_SOURCES,
} = require('../contracts/loopStateContract');
const {
  assertParentRunAllowed,
  normalizeGenerationId,
} = require('../contracts/runLineageContract');
const { PlanningRun } = require('../run/PlanningRun.model');
const { publishGatePreview } = require('../engines/g4/pipelineProgress');
const { reduceProgressState } = require('../run/progressStateReducer');
const {
  assertCallbackConfigured,
  notifyRunAccepted,
  notifyJobResult,
} = require('../clients/project.client');

const PHASE_JOBS = new Set(['phase_how', 'phase_what']);
const PHASE_ONLY_ERROR = 'PHASE_ONLY_RUNS';

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
  if (!PHASE_JOBS.has(job)) {
    const error = new Error(
      `Phase-only planning: unsupported job "${job}" — use phase_what or phase_how`
    );
    error.code = PHASE_ONLY_ERROR;
    error.statusCode = 410;
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

    const idempotencyKey =
      String(body.idempotencyKey || body.requestKey || '').trim() ||
      `${String(body.packId)}:${job}:${snapshotId}:${String(
        body.input?.inputFingerprint || ''
      )}`;

    let parentRunId = null;
    const rawParent = body.parentRunId != null ? String(body.parentRunId).trim() : '';
    if (rawParent) {
      const parent = await getRunById(rawParent);
      const allowed = assertParentRunAllowed(parent, {
        packId: body.packId,
        organizationId: body.organizationId,
      });
      parentRunId = allowed.parentRunId;
    }

    const doc = await createQueuedRun({
      runId: body.runId,
      projectId: body.projectId,
      packId: body.packId,
      organizationId: body.organizationId,
      snapshotId,
      parentRunId,
      approvedSrsVersion: body.approvedSrsVersion,
      snapshotPayloadRef: body.snapshotPayloadRef || body.snapshot?.ref,
      trigger: body.trigger || 'manual',
      initiatedBy: body.initiatedBy,
      job,
      input: body.input,
      idempotencyKey,
    });

    const childId = String(doc._id);
    const generationId = normalizeGenerationId(childId);
    if (!doc.generationId || String(doc.generationId) !== generationId) {
      await PlanningRun.updateOne({ _id: childId }, { $set: { generationId } });
      doc.generationId = generationId;
    }

    const publicRun = toPublicRun(doc);
    const isReplay = Boolean(doc.__idempotentReplay);

    if (!isReplay) {
      const rawFb = body.input?.humanFeedback || body.input?.feedback || null;
      if (job === 'phase_what' && rawFb) {
        const humanFeedback = parseFeedback(
          typeof rawFb === 'object'
            ? { kind: 'requirement_feedback', source: FEEDBACK_SOURCES.GATE1, ...rawFb }
            : {
                kind: 'requirement_feedback',
                source: FEEDBACK_SOURCES.GATE1,
                text: String(rawFb),
              }
        );
        await saveCheckpoint(childId, {
          runId: childId,
          parentRunId,
          generationId,
          job,
          projectId: body.projectId,
          packId: body.packId,
          organizationId: body.organizationId,
          approvedSrsVersion: body.approvedSrsVersion,
          snapshotId,
          humanFeedback,
          lastFeedback: humanFeedback,
          history: buildLoop1ChildHistory(),
          status: 'queued',
          currentNode: 'loop1:seed',
        });
        console.info(
          `[planning] loop1:child parent=${parentRunId || ''} child=${childId}`
        );
      }

      // Acceptance notification is advisory; final job-result callback is authoritative.
      notifyRunAccepted(publicRun).catch(() => {});

      // Execute from the persisted immutable input without blocking the 202 response.
      setImmediate(() => {
        processRunAsync(String(doc._id)).catch((err) => {
          console.error('[planning] processRunAsync', err?.message || err);
        });
      });
    }

    return res.status(202).json({
      success: true,
      runId: publicRun.runId,
      status: publicRun.status,
      idempotentReplay: isReplay || undefined,
      data: publicRun,
    });
  } catch (err) {
    const status =
      err.code === 'ACTIVE_RUN_EXISTS' ||
      err.code === 'PARENT_RUN_MISMATCH' ||
      err.code === 'PARENT_RUN_NOT_FOUND' ||
      err.code === 'PARENT_RUN_INVALID_JOB'
        ? 409
        : [
              'SNAPSHOT_REQUIRED',
              'RUN_IDENTIFIERS_REQUIRED',
              'RUN_IDENTIFIERS_INVALID',
              'HOW_JOB_UNSUPPORTED',
              'JOB_UNSUPPORTED',
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
    const updated = await PlanningRun.findOneAndUpdate(
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
    // S5: TERMINAL → delete; RESUMABLE failed keeps CP (classifier).
    await clearCheckpointIfTerminal(
      runId,
      {
        status: finalStatus,
        error: updated?.error || run.error,
        checkpoint: (await loadCheckpoint(runId))?.checkpoint?.state || null,
      },
      { deleteCheckpoint }
    );
    return updated;
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
  const { checkpoint: _ignoredCheckpoint, ...mongoPatch } = patch;
  void _ignoredCheckpoint;
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
        ...mongoPatch,
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
  // Claim from queued — clear HITL leftovers (gate preview) but NEVER wipe pipeline
  // progress. Data Gate resume re-enters queued; wiping step/substep made FE flash
  // "step 1 / prepare" until the next semantic progress event.
  const freshClaim = await PlanningRun.findOneAndUpdate(
    {
      _id: runId,
      status: 'queued',
      attempt: { $lt: EXECUTION_MAX_ATTEMPTS },
    },
    {
      $set: {
        status: 'running',
        currentNode: 'execute',
        startedAt: now,
        executionClaimedAt: now,
        executionLeaseOwner,
        executionLeaseExpiresAt: new Date(now.getTime() + EXECUTION_LEASE_MS),
        gate: null,
        gatePreview: null,
        currentTool: null,
      },
      $inc: { attempt: 1 },
    },
    { new: true }
  ).lean();
  if (freshClaim) return { run: freshClaim, executionLeaseOwner };

  // Lease reclaim while already running — do not wipe in-flight progress
  const run = await PlanningRun.findOneAndUpdate(
    {
      _id: runId,
      attempt: { $lt: EXECUTION_MAX_ATTEMPTS },
      status: 'running',
      executionLeaseExpiresAt: { $lte: now },
    },
    {
      $set: {
        status: 'running',
        currentNode: 'execute_how',
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

async function processRunAsync(runId) {
  const claim = await claimRunExecution(runId);
  const claimed = claim?.run;
  if (!claimed) return;
  let run = claimed;
  const { executionLeaseOwner } = claim;

  // G1 Step 2 — attach catalogs on AI service before tools (RULE-11)
  try {
    const { enrichRunInputWithG1Catalogs } = require('../knowledge/enrichRunInputWithG1Catalogs');
    const enriched = await enrichRunInputWithG1Catalogs(run);
    run = enriched.run;
  } catch (g1Err) {
    console.warn('[planning] attachG1Catalogs', g1Err?.message || g1Err);
  }

  if (run.job === 'phase_how' || run.job === 'phase_what') {
    try {
      const {
        hydrateRunInputFromSnapshot,
      } = require('../knowledge/hydrateRunInputFromSnapshot');
      const {
        hydrateToolDataFromSnapshot,
      } = require('../knowledge/hydrateToolDataFromSnapshot');
      const hydrated = await hydrateRunInputFromSnapshot(run);
      let runtimeSnapshot = hydrated.snapshot || {};
      const runtimePack = hydrated.pack || {};
      // Semantic Contract: ensure canonicalRaw visible on snapshot for G4/section input
      if (
        !runtimeSnapshot.canonicalRaw &&
        runtimePack.aiAnalysis?.canonicalRaw
      ) {
        runtimeSnapshot.canonicalRaw = runtimePack.aiAnalysis.canonicalRaw;
      }
      // G1 catalogs after S2S hydrate (do not invent snapshot before hydrate)
      try {
        const { attachG1Catalogs } = require('../knowledge/attachG1Catalogs');
        const g1 = attachG1Catalogs({
          ...runtimeSnapshot,
          pack: runtimePack,
          staffingPlan: runtimePack.staffingPlan || runtimeSnapshot.staffingPlan,
          requirementSkills:
            runtimePack.requirementSkills || runtimeSnapshot.requirementSkills,
        });
        if (g1?.snapshot) runtimeSnapshot = g1.snapshot;
      } catch (g1After) {
        console.warn('[planning] attachG1Catalogs after hydrate', g1After?.message || g1After);
      }
      const toolData = hydrateToolDataFromSnapshot(
        run.input?.toolData,
        runtimeSnapshot
      );

      const loadedCp = await loadCheckpoint(runId);
      const cpState = loadedCp?.checkpoint?.state || null;
      const selectiveNames = cpState?.selectiveReplanSteps;
      const isSelectiveHow =
        run.job === 'phase_how' &&
        Array.isArray(selectiveNames) &&
        selectiveNames.length > 0;

      let humanFeedback = null;
      const rawFb = run.input?.humanFeedback || run.input?.feedback || null;
      const generationId =
        normalizeGenerationId(run.generationId || runId) || String(runId);
      const parentRunId =
        run.parentRunId != null ? String(run.parentRunId).trim() : null;
      if (rawFb) {
        humanFeedback = parseFeedback(
          typeof rawFb === 'object'
            ? {
                kind: 'requirement_feedback',
                source: FEEDBACK_SOURCES.GATE1,
                ...rawFb,
              }
            : {
                kind: 'requirement_feedback',
                source: FEEDBACK_SOURCES.GATE1,
                text: String(rawFb),
              }
        );
        const priorHistory = Array.isArray(cpState?.history) ? cpState.history : [];
        const history = hasLoop1ChildTriad(priorHistory)
          ? priorHistory
          : buildLoop1ChildHistory(priorHistory);
        await saveCheckpoint(runId, {
          ...(cpState || {}),
          job: run.job,
          projectId: run.projectId,
          packId: run.packId,
          organizationId: run.organizationId,
          approvedSrsVersion: run.approvedSrsVersion,
          snapshotId: run.snapshotId,
          parentRunId,
          generationId,
          humanFeedback,
          lastFeedback: humanFeedback,
          history,
        });
      }

      const { runAgentPhase } = require('../orchestration/agentLoopRunner');
      const phaseOut = await runAgentPhase({
        phase: run.job === 'phase_what' ? 'what' : 'how',
        container: cpState?.container || run.input?.container,
        pack: cpState?.pack || runtimePack,
        toolData: cpState?.toolData || toolData,
        snapshot: runtimeSnapshot,
        snapshotId: run.snapshotId,
        runId,
        parentRunId,
        generationId,
        g4Opts: {
          ...whatG4Opts(run, cpState),
          ...(run.input?.g4Opts || {}),
          loop1Reenter: Boolean(humanFeedback?.kind === 'requirement_feedback'),
          priorPartial:
            run.input?.g4Opts?.priorPartial ||
            cpState?.understandingPartial ||
            cpState?.g4Partial ||
            null,
          reuseContextPackage:
            run.input?.g4Opts?.reuseContextPackage || cpState?.contextPackage || null,
        },
        resumeState: run.job === 'phase_how' ? cpState : null,
        selectiveToolNames: isSelectiveHow ? selectiveNames : null,
        humanFeedback,
        onProgress: (evt) => reportPipelineProgress(runId, evt),
        onCheckpoint: (agentState) =>
          saveCheckpoint(runId, {
            ...agentState,
            projectId: run.projectId,
            packId: run.packId,
            organizationId: run.organizationId,
            approvedSrsVersion: run.approvedSrsVersion,
            job: run.job,
            parentRunId: agentState.parentRunId || parentRunId,
            generationId: agentState.generationId || generationId,
            humanFeedback: agentState.humanFeedback || humanFeedback,
          }),
      });
      if (phaseOut?.paused) {
        await pauseRunForDataGate(run, phaseOut);
        return;
      }
      const loop1Reuse =
        phaseOut.loop1Reuse ||
        phaseOut.container?.phaseRuns?.phase_what?.loop1Reuse ||
        null;
      const output = {
        job: run.job,
        currentJob: run.job,
        container: phaseOut.container,
        g4Understanding: phaseOut.g4Understanding || null,
        proposalFragment: phaseOut.proposalFragment || null,
        loop1Reuse,
        result: {
          phase: phaseOut.phase,
          history: phaseOut.history,
          hitl: phaseOut.hitl,
          durationMs: phaseOut.durationMs,
          feasibility: phaseOut.feasibility,
          g4Understanding: phaseOut.g4Understanding || null,
          proposalFragment: phaseOut.proposalFragment || null,
          selective: Boolean(phaseOut.selective),
          loop1Reuse,
          corpusContentHash: phaseOut.corpusContentHash || null,
        },
        meta: {
          llmCalls: phaseOut.g4Understanding?.meta?.llmCalls || 0,
          durationMs: phaseOut.durationMs,
          agentic: true,
          selective: Boolean(phaseOut.selective),
          skillId: phaseOut.g4Understanding?.meta?.skillId || null,
          promptVersion: phaseOut.g4Understanding?.meta?.promptVersion || null,
        },
      };
      const callbackPayload = {
        runId,
        status: 'completed',
        job: run.job,
        projectId: run.projectId,
        packId: run.packId,
        organizationId: run.organizationId,
        snapshotId: run.snapshotId,
        result: output,
        g4Understanding: phaseOut.g4Understanding || null,
        proposalFragment: phaseOut.proposalFragment || null,
        loop1Reuse,
      };
      await saveCheckpoint(runId, {
        job: run.job,
        projectId: run.projectId,
        packId: run.packId,
        organizationId: run.organizationId,
        approvedSrsVersion: run.approvedSrsVersion,
        snapshotId: run.snapshotId,
        phaseOut,
        history: phaseOut.history,
        toolResults: phaseOut.toolResults,
        evidence: phaseOut.g4Understanding?.evidence || [],
        evaluationResult: phaseOut.evaluate,
        feasibility: phaseOut.feasibility,
        currentNode: 'callback_pending',
        status: 'callback_pending',
        iteration: Array.isArray(phaseOut.history) ? phaseOut.history.length : 0,
        hitl: phaseOut.hitl,
        selectiveReplanSteps: null,
      });
      await stageCallback(run, executionLeaseOwner, callbackPayload, {
        result: output,
        evidence: phaseOut.g4Understanding?.evidence || [],
        error: null,
      });
    } catch (error) {
      const callbackError = {
        code: error.code || 'AGENT_PHASE_FAILED',
        message: error.message,
      };
      const failedState = {
        job: run.job,
        snapshotId: run.snapshotId,
        status: 'failed',
        currentNode: 'failed',
        unresolvedIssues: [callbackError],
        parentRunId: run.parentRunId || null,
        generationId: normalizeGenerationId(run.generationId || runId),
      };
      await saveCheckpoint(runId, failedState).catch(() => {});
      const loadedFail = await loadCheckpoint(runId).catch(() => null);
      await clearCheckpointIfTerminal(
        runId,
        {
          status: 'failed',
          error: callbackError,
          checkpoint: loadedFail?.checkpoint?.state || failedState,
        },
        { deleteCheckpoint }
      );
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

  // RULE-PO-01: no per-job / legacy graph execute
  {
    const callbackError = {
      code: PHASE_ONLY_ERROR,
      message: `Phase-only: refusing to execute job="${run.job}"`,
    };
    await saveCheckpoint(runId, {
      job: run.job,
      snapshotId: run.snapshotId,
      status: 'failed',
      currentNode: 'failed',
      unresolvedIssues: [callbackError],
    }).catch(() => {});
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
    const offset = req.query?.rowOffset;
    const page =
      offset != null && String(offset) !== ''
        ? { offset, limit: req.query?.rowLimit }
        : null;
    return res.json({ success: true, data: toPublicRun(doc, page) });
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
    await clearCheckpointIfTerminal(
      req.params.runId,
      { status: doc.status, error: doc.error, checkpoint: null, explicitTerminal: doc.status === 'cancelled' },
      { deleteCheckpoint }
    );
    return res.json({ success: true, data: toPublicRun(doc) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

function whatG4Opts(run, cpState) {
  if (run.job !== 'phase_what') return run.input?.g4Opts || {};
  const inputOpts =
    run.input?.g4Opts && typeof run.input.g4Opts === 'object' ? run.input.g4Opts : {};
  const isLoop1 = Boolean(
    inputOpts.loop1Reenter ||
      run.input?.humanFeedback ||
      run.input?.feedback
  );
  // RULE-R01/R07: never pause at Data Gate.
  // Loop1: keep durable priorPartial/reuse from pack seed (PLAN B).
  // Non-Loop1: ignore legacy g4Partial resume (data_gate removed).
  return {
    ...inputOpts,
    pauseAtDataGate: false,
    ...(isLoop1
      ? {}
      : { priorPartial: null }),
  };
}

/** RULE-R07: cancel legacy waiting_human:data_review and release activeKey. */
async function cancelLegacyDataGateRun(runId, reason = 'data_gate_removed') {
  const cancelled = await cancelRunStore(runId);
  if (!cancelled) return null;
  await PlanningRun.updateOne(
    { _id: runId },
    {
      $set: {
        error: { code: reason, message: reason },
        gate: null,
      },
    }
  );
  try {
    await deleteCheckpoint(runId);
  } catch {
    /* ignore */
  }
  console.info(`[planning] legacy data_gate cleanup runId=${runId} reason=${reason}`);
  return cancelled;
}

async function reportPipelineProgress(runId, evt) {
  try {
    const doc = await PlanningRun.findById(runId)
      .select(
        'pipelineStep pipelineSubstep currentNode currentTool progressVersion status'
      )
      .lean();
    if (!doc) return;

    const result = reduceProgressState(doc, evt, { runId: String(runId), now: new Date() });
    if (result.action === 'ignore') {
      if (result.reason === 'stale_seq' || result.reason === 'backward_substep') {
        console.info(
          JSON.stringify({
            event: 'what.progress.stale',
            runId: String(runId),
            reason: result.reason,
            seq: result.event?.seq,
            progressVersion: doc.progressVersion || 0,
          })
        );
      }
      return;
    }
    if (result.action === 'idempotent') return;

    const next = result.next;
    const $set = {
      progressVersion: next.progressVersion,
      progressUpdatedAt: next.progressUpdatedAt,
    };
    if (next.pipelineStep != null) $set.pipelineStep = next.pipelineStep;
    if (next.pipelineSubstep) {
      $set.pipelineSubstep = next.pipelineSubstep;
      // Clear gate flag when advancing business progress (not waiting_human pause)
      if (result.event?.status !== 'waiting_human') {
        $set.gate = null;
      }
    }
    if (next.currentNode != null) $set.currentNode = next.currentNode;
    if (Object.prototype.hasOwnProperty.call(next, 'currentTool')) {
      $set.currentTool = next.currentTool;
    }

    await PlanningRun.updateOne({ _id: runId }, { $set });

    if (
      result.from.pipelineSubstep !== next.pipelineSubstep ||
      result.from.pipelineStep !== next.pipelineStep
    ) {
      console.info(
        JSON.stringify({
          event: 'what.progress.transition',
          runId: String(runId),
          from: {
            step: result.from.pipelineStep,
            substep: result.from.pipelineSubstep,
          },
          to: {
            step: next.pipelineStep,
            substep: next.pipelineSubstep,
          },
          node: next.currentNode || null,
          tool: next.currentTool || null,
          seq: next.progressVersion,
        })
      );
    }
  } catch (err) {
    console.warn('[planning] pipeline progress', err?.message || err);
  }
}

async function pauseRunForDataGate(run, phaseOut) {
  const runId = String(run._id || run.runId);
  const gatePreview = publishGatePreview(phaseOut.gatePreview);
  await saveCheckpoint(runId, {
    job: run.job,
    projectId: run.projectId,
    packId: run.packId,
    organizationId: run.organizationId,
    approvedSrsVersion: run.approvedSrsVersion,
    snapshotId: run.snapshotId,
    g4Partial: phaseOut.partial,
    gatePreview: phaseOut.gatePreview || null,
    dataGateDecision: null,
    gate: 'data_review',
    currentNode: 'gate:data_review',
    status: 'waiting_human',
    history: phaseOut.history,
  });
  await PlanningRun.findByIdAndUpdate(runId, {
    $set: {
      status: 'waiting_human',
      currentNode: 'gate:data_review',
      pipelineStep: 2,
      pipelineSubstep: 'gate_preview',
      gate: 'data_review',
      gatePreview: phaseOut.gatePreview || gatePreview,
      executionLeaseOwner: null,
      executionLeaseExpiresAt: null,
    },
  });
  console.info(`[planning] pause runId=${runId} gate=data_review`);
}

async function resumeRun(req, res) {
  try {
    const existing = await getRunById(req.params.runId);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Run not found' });
    }

    const decision = String(req.body?.decision || '').trim().toLowerCase();
    const isLegacyDataGate =
      String(existing.status) === 'waiting_human' &&
      String(existing.gate || '') === 'data_review';

    // RULE-R07: Data Gate removed — pass/reject both cancel + release activeKey.
    if (
      isLegacyDataGate &&
      (decision === 'reject' || decision === 'pass' || decision === 'cancel')
    ) {
      const cancelled = await cancelLegacyDataGateRun(
        req.params.runId,
        decision === 'pass' ? 'data_gate_removed_pass' : 'data_gate_removed'
      );
      if (!cancelled) {
        return res.status(404).json({ success: false, message: 'Run not found' });
      }
      const updated = await getRunById(req.params.runId);
      return res.json({
        success: true,
        data: toPublicRun(updated),
        legacyDataGateCleanup: true,
      });
    }
    if (decision === 'reject' && String(existing.gate || '') === 'data_review') {
      const cancelled = await cancelLegacyDataGateRun(req.params.runId);
      if (!cancelled) {
        return res.status(404).json({ success: false, message: 'Run not found' });
      }
      const updated = await getRunById(req.params.runId);
      return res.json({ success: true, data: toPublicRun(updated), legacyDataGateCleanup: true });
    }

    // callback_pending: deliver only — G15 key not required
    await assertCheckpointForResume(req.params.runId, {
      hasCallbackPayload: Boolean(existing.callbackPayload),
    });

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
    const status =
      err.code === 'RESUME_DENIED' || err.code === 'CHECKPOINT_MISSING'
        ? 409
        : 500;
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

    const parsed = parseFeedback({
      ...(req.body || {}),
      kind: (req.body && req.body.kind) || 'planning_feedback',
      source: (req.body && req.body.source) || FEEDBACK_SOURCES.GATE2,
    });
    existing.lastFeedback = parsed;
    existing.status = 'replanning';
    const { resolveToolsForImpactScope } = require('../feedback/selectiveReplan');
    const selectiveSteps = resolveToolsForImpactScope(parsed.impactScope);
    existing.markModified('lastFeedback');
    await existing.save();

    const loaded = await loadCheckpoint(runId);
    const prior = loaded?.checkpoint?.state || {};
    await saveCheckpoint(runId, {
      ...prior,
      humanFeedback: parsed,
      lastFeedback: parsed,
      selectiveReplanSteps: selectiveSteps.map((s) => s.toolName),
      currentToolIndex: 0,
      currentToolName: null,
      status: 'replanning',
      snapshotId: existing.snapshotId,
      runId: String(existing._id),
      generationId: normalizeGenerationId(existing.generationId || existing._id),
      parentRunId: existing.parentRunId || prior.parentRunId || null,
      job: existing.job,
      history: buildLoop2ReplanHistory(prior.history),
    });

    // Loop2: kick selective re-execute (HARD-02 one path; ProjectPlan not autoConfirm)
    setImmediate(() => {
      processRunAsync(String(existing._id)).catch(() => {});
    });

    return res.status(202).json({
      success: true,
      data: {
        runId: String(existing._id),
        status: existing.status,
        feedback: parsed,
        selectiveReplanTools: selectiveSteps.map((s) => s.toolName),
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
