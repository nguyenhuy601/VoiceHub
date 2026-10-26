/**
 * Bridge: tool enqueue + awaitWave helpers for llmJobs infra / tests.
 * RULE-LG-Q-01: Queue stays outside phase graphs. WHAT/HOW do NOT wire awaitWave —
 * selectTools + Send only. Long jobs (WBS) resume via interrupt/Command/updateState
 * on the LangGraph checkpointer — never hand-merge G15 as resume SoT.
 */

const { JOB_TYPES, isJobTypeEnabled } = require('./llmJobContract');
const { enqueueLlmJobsFromTool, waitAndApplyWave, mergePendingJobIds } = require('./graph/llmJobGraphPort');

function waveNodeId(layerIndex) {
  return `awaitWave${layerIndex}`;
}

/**
 * Build edges: enterTools -> layer0 tools -> awaitWave0 -> layer1 tools -> awaitWave1 -> ... -> gateTools
 * RULE-LLM-13 fan-in.
 *
 * @param {{ layers: string[][], enterNode?: string, gateNode?: string }} opts
 */
function planLayeredWaveEdges(opts) {
  const layers = Array.isArray(opts.layers) ? opts.layers : [];
  const enterNode = opts.enterNode || 'enterTools';
  const gateNode = opts.gateNode || 'gateTools';
  const edges = [];
  const waveIds = [];

  let prev = enterNode;
  for (let i = 0; i < layers.length; i += 1) {
    const layer = layers[i].filter(Boolean);
    if (!layer.length) continue;
    const wave = waveNodeId(i);
    waveIds.push(wave);
    for (const tool of layer) {
      edges.push([prev, tool]);
    }
    edges.push([layer.length === 1 ? layer[0] : layer, wave]);
    prev = wave;
  }
  edges.push([prev, gateNode]);
  return { edges, waveIds, layers };
}

/**
 * @param {string} toolName
 * @param {string|null} engineId
 */
function resolveWhatJobType(toolName, engineId) {
  if (toolName === 'WhatFrTool') return JOB_TYPES.WHAT_FR_SEMANTIC;
  if (engineId) return JOB_TYPES.WHAT_SECTION_DERIVE;
  return null;
}

/**
 * @param {string} toolName
 */
function resolveHowJobType(toolName) {
  if (toolName === 'RiskTool') return JOB_TYPES.HOW_RISK;
  if (toolName === 'QualityPlanTool') return JOB_TYPES.HOW_QUALITY;
  if (toolName === 'DependencyTool') return JOB_TYPES.HOW_DEPENDENCY;
  if (toolName === 'WbsTool') return JOB_TYPES.WBS_CHUNK;
  return null;
}

/**
 * Enqueue WHAT section/FR job; returns pending rows or null if queue off / skipped.
 */
async function enqueueWhatToolJob(opts) {
  const {
    toolName,
    engineId,
    waveId,
    state,
    payload,
    env,
    forceEnqueue,
  } = opts;
  const jobType = resolveWhatJobType(toolName, engineId);
  if (!jobType) return null;
  if (!isJobTypeEnabled(jobType, env) && !forceEnqueue) return null;

  const out = await enqueueLlmJobsFromTool(
    {
      jobType,
      phase: 'WHAT',
      runId: state.runId,
      snapshotId: state.snapshotId,
      waveId,
      toolName,
      pack: state.pack,
      container: state.container,
      snapshot: state.snapshot,
      payload: {
        engineId: engineId || null,
        ...payload,
      },
      idempotencyKey: `${jobType}:${state.runId || 'run'}:${toolName}:${waveId || 'w'}`,
      requireContext: false,
      forceEnqueue,
    },
    env
  );
  if (out.skipped) return null;
  return {
    pending: out.pending,
    jobIds: out.jobIds,
    contextRef: out.contextRef,
  };
}

/**
 * Enqueue HOW tool job.
 */
async function enqueueHowToolJob(opts) {
  const { toolName, waveId, state, payload, env, forceEnqueue, batch } = opts;
  const jobType = resolveHowJobType(toolName);
  if (!jobType) return null;
  if (!isJobTypeEnabled(jobType, env) && !forceEnqueue) return null;

  const out = await enqueueLlmJobsFromTool(
    {
      jobType,
      phase: 'HOW',
      runId: state.runId,
      snapshotId: state.snapshotId,
      waveId,
      toolName,
      pack: state.pack,
      container: state.container,
      snapshot: state.snapshot,
      system: payload?.system,
      user: payload?.user,
      semantic: payload?.semantic,
      facts: payload?.facts,
      payload,
      batch,
      idempotencyKey: `${jobType}:${state.runId || 'run'}:${toolName}:${waveId || 'w'}`,
      requireContext: false,
      forceEnqueue,
    },
    env
  );
  if (out.skipped) return null;
  return {
    pending: out.pending,
    jobIds: out.jobIds,
    contextRef: out.contextRef,
  };
}

/**
 * Create awaitWave node handler for a layer.
 */
function createAwaitWaveNode(layerIndex, hooks = {}) {
  const onProgress = hooks.onProgress || null;
  const applyWhat = hooks.applyWhat || null;
  const applyHow = hooks.applyHow || null;
  const phase = hooks.phase || 'WHAT';

  return async function awaitWaveNode(state) {
    const waveId = waveNodeId(layerIndex);
    onProgress?.({
      node: waveId,
      phase: String(phase).toLowerCase(),
      step: 4,
      substep: 'awaitWave',
    });

    const pending = Array.isArray(state.pendingJobIds) ? state.pendingJobIds : [];
    const forWave = pending.filter((row) => row && row.waveId === waveId);
    const jobIds = forWave.map((row) => row.jobId);
    if (!jobIds.length) {
      return { history: [`awaitWave:${waveId}:empty`] };
    }

    const env = state.env || process.env;
    const wave = await waitAndApplyWave({
      jobIds,
      env,
      generateJsonFn: state.generateJsonFn || hooks.generateJsonFn,
      useEchoStub: state.useEchoStub === true,
      allowEchoFallback: state.allowEchoFallback === true,
      applyOne: async (jobId, result) => {
        const meta = forWave.find((r) => r.jobId === jobId) || {};
        if (phase === 'WHAT' && typeof applyWhat === 'function') {
          return applyWhat(state, jobId, result, meta);
        }
        if (phase === 'HOW' && typeof applyHow === 'function') {
          return applyHow(state, jobId, result, meta);
        }
        return result;
      },
    });

    const remaining = pending.filter((row) => row.waveId !== waveId);
    const update = {
      pendingJobIds: { __replace: true, ids: remaining },
      history: [`awaitWave:${waveId}:applied:${wave.appliedIds.length}`],
      llmWaveResults: {
        ...(state.llmWaveResults || {}),
        [waveId]: wave.results,
      },
    };

    for (const patch of wave.patches || []) {
      if (!patch || typeof patch !== 'object') continue;
      if (patch.srsProposal) update.srsProposal = patch.srsProposal;
      if (patch.frUnderstanding) update.frUnderstanding = patch.frUnderstanding;
      if (patch.container) update.container = patch.container;
      if (patch.engineResultsById) {
        update.engineResultsById = {
          ...(update.engineResultsById || state.engineResultsById || {}),
          ...patch.engineResultsById,
        };
      }
      if (patch.semanticStatuses) {
        update.semanticStatuses = {
          ...(update.semanticStatuses || state.semanticStatuses || {}),
          ...patch.semanticStatuses,
        };
      }
    }
    return update;
  };
}

module.exports = {
  waveNodeId,
  planLayeredWaveEdges,
  resolveWhatJobType,
  resolveHowJobType,
  enqueueWhatToolJob,
  enqueueHowToolJob,
  createAwaitWaveNode,
  mergePendingJobIds,
  JOB_TYPES,
  isJobTypeEnabled,
};
