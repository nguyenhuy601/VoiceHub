/**
 * Enrich pack/summary with live APS run (whitelist) when phase is in-flight.
 */
const { getRun } = require('../../clients/aiProjectPlanning.client');
const RequirementPack = require('../../models/RequirementPack');

const FLAGGED_CAP = 30;
const PAGE_LIMIT_MAX = 20;
const CELL_LIST_CAP = 8;

function clipList(value) {
  return (Array.isArray(value) ? value : [])
    .slice(0, CELL_LIST_CAP)
    .map((item) => String(item));
}

function slimRow(row) {
  return {
    frId: String(row?.frId || ''),
    title: String(row?.title || '').slice(0, 160),
    description: String(row?.description || '').slice(0, 240),
    actors: clipList(row?.actors),
    actions: clipList(row?.actions),
    objects: clipList(row?.objects),
    fields: clipList(row?.fields),
    flags: Array.isArray(row?.flags) ? row.flags.map((flag) => String(flag)) : [],
    candidate: Boolean(row?.candidate),
  };
}

/**
 * Default omits rows and returns rowTotal. With { offset, limit } returns one page.
 * If the payload is already a page (rows shorter than rowTotal), that page is kept.
 */
function slimGatePreview(raw, page) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const qualityIn = raw.quality && typeof raw.quality === 'object' ? raw.quality : {};
  const flaggedIn = Array.isArray(raw.flagged) ? raw.flagged : [];
  const storedRows = Array.isArray(raw.rows) ? raw.rows : [];
  const rowTotal = Number.isFinite(Number(raw.rowTotal)) ? Number(raw.rowTotal) : storedRows.length;
  const summary = {
    frCount: Number(raw.frCount) || 0,
    duplicateCount: Number(raw.duplicateCount) || 0,
    candidateCount: Number(raw.candidateCount) || 0,
    skippedCount: Number(raw.skippedCount) || 0,
    quality: {
      missingActor: Number(qualityIn.missingActor) || 0,
      missingAc: Number(qualityIn.missingAc) || 0,
      thinText: Number(qualityIn.thinText) || 0,
      ambiguous: Number(qualityIn.ambiguous) || 0,
      duplicate: Number(qualityIn.duplicate) || 0,
      crossModule: Number(qualityIn.crossModule) || 0,
    },
    flagged: flaggedIn.slice(0, FLAGGED_CAP).map((row) => ({
      frId: String(row?.frId || ''),
      title: String(row?.title || '').slice(0, 160),
      flags: Array.isArray(row?.flags) ? row.flags.map((flag) => String(flag)) : [],
    })),
    rowTotal,
  };
  const wantsPage = page && page.offset != null && page.offset !== '';
  if (!wantsPage) return summary;
  const limit = Math.min(PAGE_LIMIT_MAX, Math.max(1, Number(page.limit) || PAGE_LIMIT_MAX));
  const alreadyPaged = storedRows.length > 0 && storedRows.length <= limit && storedRows.length < rowTotal;
  const offset = Math.max(0, Number(page.offset) || 0);
  const pageRows = alreadyPaged ? storedRows : storedRows.slice(offset, offset + limit);
  return { ...summary, rows: pageRows.map(slimRow) };
}

function phaseNeedsLiveRun(phaseMeta) {
  if (!phaseMeta || typeof phaseMeta !== 'object') return false;
  const status = String(phaseMeta.status || '').trim();
  const runId = String(phaseMeta.remoteRunId || '').trim();
  if (!runId) return false;
  return (
    status === 'pending' ||
    status === 'running' ||
    status === 'stopped' ||
    status === 'waiting_human'
  );
}

/**
 * RULE-M05: prefer phase_what when both in-flight; else phase_how.
 * @returns {{ key: 'phase_what'|'phase_how', meta: object }|null}
 */
function resolveInFlightPhaseRun(phaseRuns) {
  const runs = phaseRuns && typeof phaseRuns === 'object' ? phaseRuns : {};
  const what = runs.phase_what && typeof runs.phase_what === 'object' ? runs.phase_what : null;
  const how = runs.phase_how && typeof runs.phase_how === 'object' ? runs.phase_how : null;
  if (phaseNeedsLiveRun(what)) return { key: 'phase_what', meta: { ...what } };
  if (phaseNeedsLiveRun(how)) return { key: 'phase_how', meta: { ...how } };
  return null;
}

function whitelistLiveRun(publicRun, page) {
  if (!publicRun || typeof publicRun !== 'object') return null;
  return {
    runId: publicRun.runId || null,
    status: publicRun.status || null,
    currentNode: publicRun.currentNode || null,
    currentTool: publicRun.currentTool || null,
    stage: publicRun.stage || publicRun.currentNode || null,
    computeStatus: publicRun.computeStatus || null,
    callbackStatus: publicRun.callbackStatus || null,
    job: publicRun.job || null,
    error: publicRun.error || null,
    callbackAttempts: publicRun.callbackAttempts ?? 0,
    callbackLastError: publicRun.callbackLastError || null,
    startedAt: publicRun.startedAt || null,
    completedAt: publicRun.completedAt || null,
    progressUpdatedAt: publicRun.progressUpdatedAt || null,
    pipelineStep: publicRun.pipelineStep ?? null,
    pipelineSubstep: publicRun.pipelineSubstep || null,
    gate: publicRun.gate || null,
    gatePreview: slimGatePreview(publicRun.gatePreview, page),
  };
}

/**
 * @param {object} pack lean pack or summary carrier with aiAnalysis
 * @param {{ offset?: number|string, limit?: number|string }|null} [page]
 * @returns {Promise<object>} pack with liveRun + in-flight phase stage fields when available
 */
async function attachLiveRunToPackAiAnalysis(pack, page) {
  if (!pack || typeof pack !== 'object') return pack;
  const ai = pack.aiAnalysis && typeof pack.aiAnalysis === 'object' ? { ...pack.aiAnalysis } : null;
  if (!ai) return pack;
  const phaseRuns = ai.phaseRuns && typeof ai.phaseRuns === 'object' ? { ...ai.phaseRuns } : {};
  const inFlight = resolveInFlightPhaseRun(phaseRuns);
  if (!inFlight) {
    return { ...pack, aiAnalysis: ai, liveRun: null };
  }
  const { key: phaseKey, meta: phaseMeta } = inFlight;
  const runId = String(phaseMeta.remoteRunId).trim();
  const wantsPage = page && page.offset != null && page.offset !== '';
  const query = wantsPage ? { rowOffset: page.offset, rowLimit: page.limit } : {};
  try {
    const { status, data } = await getRun(runId, query);
    const publicRun = data?.data || data?.run || data;
    if (status >= 200 && status < 300 && publicRun && typeof publicRun === 'object') {
      const liveRun = whitelistLiveRun(
        {
          ...publicRun,
          runId: publicRun.runId || runId,
        },
        wantsPage ? page : null
      );
      phaseRuns[phaseKey] = {
        ...phaseMeta,
        stage: liveRun?.stage || phaseMeta.stage || null,
        computeStatus: liveRun?.computeStatus || phaseMeta.computeStatus || null,
        callbackStatus: liveRun?.callbackStatus || phaseMeta.callbackStatus || null,
      };
      // RULE-R01: Data Gate HITL removed — do not notify BA for data_review pause
      return {
        ...pack,
        aiAnalysis: { ...ai, phaseRuns },
        liveRun,
      };
    }
  } catch {
    /* soft — pack without liveRun */
  }
  return { ...pack, aiAnalysis: ai, liveRun: null };
}

async function maybeNotifyDataGateWaiting(pack) {
  const packId = String(pack._id || pack.id || '').trim();
  const projectId = String(pack.projectId || '').trim();
  if (!packId || !projectId) return;
  const stamped = await RequirementPack.updateOne(
    {
      _id: packId,
      $or: [
        { 'aiAnalysis.gate1.dataGateNotifiedAt': { $exists: false } },
        { 'aiAnalysis.gate1.dataGateNotifiedAt': null },
      ],
    },
    {
      $set: {
        'aiAnalysis.gate1.dataGateNotifiedAt': new Date().toISOString(),
      },
    }
  );
  if (!stamped?.modifiedCount) return;
  const { notifyAiHitlGateReviewers } = require('../phase1GatePolicy');
  await notifyAiHitlGateReviewers({
    projectId,
    organizationId: pack.organizationId,
    actorUserId: null,
    packId,
    nextPermission: 'requirement:submit',
    title: 'Data Gate — AI đang chờ duyệt dữ liệu',
    content: 'Mở trang AI HITL để Pass/Reject Data Gate.',
    kind: 'ai_hitl_data_gate',
  });
}

module.exports = {
  phaseNeedsLiveRun,
  resolveInFlightPhaseRun,
  whitelistLiveRun,
  attachLiveRunToPackAiAnalysis,
};
