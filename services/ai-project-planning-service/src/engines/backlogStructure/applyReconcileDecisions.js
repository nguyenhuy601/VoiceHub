/**
 * Apply reconcile KEEP/NEW/SPLIT/MERGE → assign final IDs (mint only for NEW/SPLIT/MERGE).
 * Skips NEEDS_REVIEW (caller must hold).
 */

const { RECONCILE_DECISIONS } = require('./constants');
const { mintEpicId, mintFeatureId, mintStoryId } = require('./backlogIdentity');

function applyReconcileDecisions(reconcileResult, opts = {}) {
  if (reconcileResult?.needsReview || reconcileResult?.canPublish === false) {
    return {
      ok: false,
      code: 'IDENTITY_NEEDS_REVIEW',
      message: 'Cannot mint/keep publish while identity review pending',
      identityReview: reconcileResult.identityReview || [],
    };
  }

  const tempRefMap = { ...(opts.tempRefMap || {}) };
  const assignedIds = [];
  const epics = [];
  const features = [];
  const stories = [];

  for (const d of reconcileResult.decisions?.epics || []) {
    if (d.decision === RECONCILE_DECISIONS.NEEDS_REVIEW) {
      return {
        ok: false,
        code: 'IDENTITY_NEEDS_REVIEW',
        identityReview: reconcileResult.identityReview,
      };
    }
    let id = d.keepId;
    if (d.decision === RECONCILE_DECISIONS.NEW || d.decision === RECONCILE_DECISIONS.SPLIT) {
      id = mintEpicId();
    }
    if (d.decision === RECONCILE_DECISIONS.MERGE && d.keepId) id = d.keepId;
    if (!id) id = mintEpicId();
    tempRefMap[d.tempId] = id;
    assignedIds.push(id);
    const c = d.candidate || {};
    epics.push({
      id,
      title: c.title,
      name: c.title,
      sourceFrIds: [...(c.sourceFrIds || [])],
      classificationDecision: c.classificationDecision,
      lineage: d.lineage || undefined,
    });
  }

  for (const d of reconcileResult.decisions?.features || []) {
    if (d.decision === RECONCILE_DECISIONS.NEEDS_REVIEW) {
      return {
        ok: false,
        code: 'IDENTITY_NEEDS_REVIEW',
        identityReview: reconcileResult.identityReview,
      };
    }
    let id = d.keepId;
    if (
      d.decision === RECONCILE_DECISIONS.NEW ||
      d.decision === RECONCILE_DECISIONS.SPLIT ||
      d.decision === RECONCILE_DECISIONS.MERGE
    ) {
      if (d.decision !== RECONCILE_DECISIONS.MERGE || !d.keepId) id = mintFeatureId();
    }
    if (!id) id = mintFeatureId();
    tempRefMap[d.tempId] = id;
    assignedIds.push(id);
    const c = d.candidate || {};
    features.push({
      id,
      title: c.title,
      name: c.title,
      parentEpicTempId: c.parentEpicTempId || c.parentEpicId || null,
      sourceFrIds: [...(c.sourceFrIds || [])],
      classificationDecision: c.classificationDecision,
      lineage: d.lineage || undefined,
      derivedFromFeatureIds: d.lineage?.derivedFromStoryIds || d.lineage?.derivedFromIds,
      supersedes: d.lineage?.supersedes,
    });
  }

  for (const d of reconcileResult.decisions?.stories || []) {
    if (d.decision === RECONCILE_DECISIONS.NEEDS_REVIEW) {
      return {
        ok: false,
        code: 'IDENTITY_NEEDS_REVIEW',
        identityReview: reconcileResult.identityReview,
      };
    }
    let id = d.keepId;
    if (
      d.decision === RECONCILE_DECISIONS.NEW ||
      d.decision === RECONCILE_DECISIONS.SPLIT ||
      (d.decision === RECONCILE_DECISIONS.MERGE && !d.keepId)
    ) {
      id = mintStoryId();
    }
    if (!id) id = mintStoryId();
    tempRefMap[d.tempId] = id;
    assignedIds.push(id);
    const c = d.candidate || {};
    stories.push({
      id,
      title: c.title,
      name: c.title,
      parentFeatureTempId: c.parentFeatureTempId || null,
      parentEpicTempId: c.parentEpicTempId || null,
      sourceFrIds: [...(c.sourceFrIds || [])],
      acRefs: [...(c.acRefs || [])],
      classificationDecision: c.classificationDecision,
      lineage: d.lineage || undefined,
      derivedFromStoryIds: d.lineage?.derivedFromStoryIds,
      supersedes: d.lineage?.supersedes,
    });
  }

  return {
    ok: true,
    tempRefMap,
    assignedIds,
    entities: { epics, features, stories },
  };
}

module.exports = { applyReconcileDecisions };
