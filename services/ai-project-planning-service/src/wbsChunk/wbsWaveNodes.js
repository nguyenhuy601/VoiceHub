/**
 * Named WBS wave stages (LangGraph-aligned):
 * dispatchWbsWave → awaitWbsWave → collectWbsResults → validateWbs
 * Mapped onto existing wbsChunkGraph nodes + orchestrator helpers.
 */

const { resolveWbsChunkTransport } = require('./wbsChunkContract');
const { listWorkUnitsByRun } = require('./wbsWorkUnitStore');

function waveThreadId(runId, inputSnapshotId) {
  return `wbs-chunk:${String(runId)}:${String(inputSnapshotId)}`;
}

function summarizeUnits(units) {
  const list = Array.isArray(units) ? units : [];
  const by = { PENDING: 0, QUEUED: 0, RUNNING: 0, SUCCEEDED: 0, FAILED: 0, DEAD_LETTER: 0, RETRY_WAIT: 0 };
  for (const u of list) {
    const s = String(u.status || '');
    if (by[s] != null) by[s] += 1;
    else by[s] = (by[s] || 0) + 1;
  }
  return {
    total: list.length,
    done: (by.SUCCEEDED || 0) + (by.FAILED || 0) + (by.DEAD_LETTER || 0),
    succeeded: by.SUCCEEDED || 0,
    failed: (by.FAILED || 0) + (by.DEAD_LETTER || 0),
    inFlight: (by.PENDING || 0) + (by.QUEUED || 0) + (by.RUNNING || 0) + (by.RETRY_WAIT || 0),
    byStatus: by,
  };
}

async function collectWbsResults(runId, env = process.env) {
  const units = await listWorkUnitsByRun(runId, env);
  return { units, progress: summarizeUnits(units) };
}

function isWaveSettled(progress) {
  return progress && progress.total > 0 && progress.inFlight === 0;
}

function shouldUseDurableAwait(env = process.env) {
  return resolveWbsChunkTransport(env) === 'rabbit';
}

module.exports = {
  waveThreadId,
  summarizeUnits,
  collectWbsResults,
  isWaveSettled,
  shouldUseDurableAwait,
};
