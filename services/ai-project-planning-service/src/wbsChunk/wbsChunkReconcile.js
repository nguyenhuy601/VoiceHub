/**
 * Merge succeeded chunk leaves and run global coverage checks.
 * Does not invent or edit source FR rows. Dead-letter chunks stay out of the tree.
 */

const {
  dedupeWbsLeaves,
  materializeWbsFromSotAndLeaves,
  resolveDecompositionOutcome,
  acCitationCoversWhitelist,
} = require('../engines/wbsProposeLlm');

function frIdOf(leaf) {
  return String(leaf?.sourceFrIds?.[0] || '').trim();
}

/**
 * @param {object[]} units
 * @param {object} context
 */
function reconcileWbsChunks(units, context = {}) {
  const snapshotId = String(context.inputSnapshotId || '');
  const frUnits = Array.isArray(context.frUnits) ? context.frUnits : [];
  const stories = Array.isArray(context.stories) ? context.stories : [];
  const epics = Array.isArray(context.epics) ? context.epics : [];
  const acceptedUnits = [];
  const rejectedSnapshotIds = [];

  for (const unit of units || []) {
    if (unit.status !== 'SUCCEEDED' || !unit.result) continue;
    if (snapshotId && unit.inputSnapshotId !== snapshotId) {
      rejectedSnapshotIds.push(unit.workUnitId);
      continue;
    }
    if (unit.result.inputSnapshotId && snapshotId && unit.result.inputSnapshotId !== snapshotId) {
      rejectedSnapshotIds.push(unit.workUnitId);
      continue;
    }
    acceptedUnits.push(unit);
  }

  const leaves = [];
  const isolatedFrIds = [];
  let llmCalls = 0;
  let promptChars = 0;
  let model = null;
  for (const unit of acceptedUnits) {
    const tasks = Array.isArray(unit.result.tasks) ? unit.result.tasks : [];
    leaves.push(...tasks);
    if (Array.isArray(unit.result.isolatedFrIds)) isolatedFrIds.push(...unit.result.isolatedFrIds);
    llmCalls += Number(unit.result.llmCalls) || 0;
    promptChars += Number(unit.result.promptChars) || 0;
    model = unit.result.model || model;
  }

  const deduped = dedupeWbsLeaves(leaves);
  const merged = deduped.leaves;
  const knownFr = new Set(frUnits.map((unit) => String(unit.id || '').trim()).filter(Boolean));
  const safeLeaves = merged.filter((leaf) => {
    const frId = frIdOf(leaf);
    return frId && knownFr.has(frId);
  });

  const coveredFr = new Set(safeLeaves.map(frIdOf).filter(Boolean));
  const uncoveredFrIds = frUnits.filter((unit) => !coveredFr.has(unit.id)).map((unit) => unit.id);
  const uncoveredAcKeys = [];
  const leavesByFr = new Map();
  for (const leaf of safeLeaves) {
    const frId = frIdOf(leaf);
    if (!frId) continue;
    if (!leavesByFr.has(frId)) leavesByFr.set(frId, []);
    leavesByFr.get(frId).push(leaf);
  }
  for (const unit of frUnits) {
    const group = leavesByFr.get(unit.id);
    if (!group?.length) continue;
    const cited = [];
    for (const leaf of group) {
      for (const ac of leaf.acRefs || []) cited.push(ac);
    }
    for (const ac of unit.ac || []) {
      if (!acCitationCoversWhitelist(ac, cited)) uncoveredAcKeys.push(`${unit.id}:${ac}`);
    }
  }

  const unresolvedStoryIds = stories
    .filter((story) => {
      const frs = Array.isArray(story.fr) ? story.fr : [];
      return frs.length > 0 && frs.every((id) => !coveredFr.has(String(id).trim()));
    })
    .map((story) => story.id);

  const deadUnits = (units || []).filter(
    (unit) => unit.status === 'DEAD_LETTER' || unit.status === 'FAILED'
  );
  const deadLetterIds = deadUnits.map((unit) => unit.workUnitId);
  const chunkError = deadUnits
    .map((unit) => String(unit.error || '').trim())
    .find(Boolean);

  if (!safeLeaves.length) {
    return {
      ok: false,
      meta: {
        source: 'llm_invalid',
        decompositionOutcome: 'failure',
        fallbackReason: deadLetterIds.length
          ? chunkError
            ? `wbs_chunks_dead_letter: ${chunkError.slice(0, 180)}`
            : 'wbs_chunks_dead_letter'
          : 'all_fr_slices_failed',
        reasonCodes: uncoveredFrIds.length ? uncoveredFrIds : ['all_fr_slices_failed'],
        isolatedFrIds,
        uncoveredFrIds,
        deadLetterIds,
        rejectedSnapshotIds,
        llmCalls,
        model,
        promptChars,
        chunks: (units || []).length,
        chunkOrchestrator: 'langgraph',
      },
    };
  }

  const decompositionOutcome = resolveDecompositionOutcome({
    leafCount: safeLeaves.length,
    unresolvedUnitIds: unresolvedStoryIds,
    uncoveredFrIds,
    uncoveredAcKeys,
  });
  const materialized = materializeWbsFromSotAndLeaves({
    epics,
    stories,
    leaves: safeLeaves,
    frUnits,
  });

  return {
    ok: true,
    tasks: materialized.tasks,
    wbs: materialized.wbs,
    meta: {
      source: (units || []).length > 1 ? 'llm_fr_tasks_chunked' : 'llm_fr_tasks',
      decompositionOutcome,
      unresolvedUnitIds: unresolvedStoryIds,
      unresolvedStoryIds,
      storyCount: stories.length,
      epicCount: epics.length,
      featureCount: materialized.wbs?.featureCount || 0,
      uncoveredFrIds,
      isolatedFrIds,
      uncoveredAcKeys,
      duplicateLeafIds: deduped.duplicateLeafIds,
      uniqueLeafCount: deduped.uniqueLeafCount,
      deadLetterIds,
      rejectedSnapshotIds,
      llmCalls,
      model,
      promptChars,
      unitCount: frUnits.length,
      leafCount: safeLeaves.length,
      chunks: (units || []).length,
      chunkOrchestrator: 'langgraph',
    },
  };
}

module.exports = { reconcileWbsChunks };
