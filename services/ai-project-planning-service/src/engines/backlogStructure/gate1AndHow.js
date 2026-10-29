/**
 * Gate1 approve + materialize + HOW version bind for backlog structure.
 */

const {
  SHAPE_VERSION,
  COVERAGE_STATUS,
  isBacklogStructureShapeVersion,
} = require('./constants');
const { isStoryId, isFeatureId, isEpicId } = require('./backlogIdentity');
const { assertDraftRevision, nextDraftRevision } = require('./draftRevision');
const { applyGate1Coverage } = require('./backlogCoverage');

/**
 * Block approve for entities still in identityReview / needsReview.
 */
function assertCanApproveBacklogEntity(backlogStructure, entityId) {
  const id = String(entityId || '').trim();
  const review = Array.isArray(backlogStructure?.identityReview)
    ? backlogStructure.identityReview
    : [];
  const pending = review.find((r) => String(r.tempId || r.entityId || '') === id || String(r.baselineId) === id);
  if (pending || backlogStructure?.meta?.publishable === false) {
    return {
      ok: false,
      code: 'IDENTITY_NEEDS_REVIEW',
      message: 'Cannot approve entity while identity review pending',
    };
  }
  // Also block if story id equals an FR id on backlog path (legacy leak)
  const stories = Array.isArray(backlogStructure?.stories) ? backlogStructure.stories : [];
  const story = stories.find((s) => String(s.id) === id);
  if (story) {
    const frs = (story.sourceFrIds || []).map(String);
    if (frs.includes(id) && !isStoryId(id)) {
      return {
        ok: false,
        code: 'STORY_ID_EQUALS_FR',
        message: 'Story id must not equal FR id on backlog path',
      };
    }
  }
  return { ok: true };
}

/**
 * Approve draft → approved baseline with version lock.
 */
function approveBacklogDraft(opts = {}) {
  const draft = opts.draft || opts.backlogStructure;
  if (!draft || typeof draft !== 'object') {
    return { ok: false, code: 'MISSING_DRAFT' };
  }
  if (draft.meta?.publishable === false || (draft.identityReview || []).length) {
    return {
      ok: false,
      code: 'IDENTITY_NEEDS_REVIEW',
      identityReview: draft.identityReview || [],
    };
  }

  const revCheck = assertDraftRevision(
    opts.currentDraftRevisionId ?? draft.meta?.draftRevisionId,
    opts.expectedDraftRevisionId
  );
  if (!revCheck.ok) return revCheck;

  if (
    opts.expectedSourceSnapshotVersion != null &&
    draft.meta?.sourceSnapshotVersion != null &&
    String(opts.expectedSourceSnapshotVersion) !== String(draft.meta.sourceSnapshotVersion)
  ) {
    return {
      ok: false,
      code: 'SOURCE_SNAPSHOT_MISMATCH',
      statusCode: 409,
      message: 'Source snapshot changed — reconcile again before approve',
    };
  }

  const coverage = applyGate1Coverage(
    {
      coverageByFrId: draft.coverageByFrId || {},
      coverageByAcRef: draft.coverageByAcRef || {},
    },
    opts.gate1CoverageDecisions || {}
  );

  const approvedBaselineVersion =
    opts.approvedBaselineVersion ||
    `baseline-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const approved = {
    ...draft,
    coverageByFrId: coverage.coverageByFrId,
    coverageByAcRef: coverage.coverageByAcRef,
    meta: {
      ...(draft.meta || {}),
      shapeVersion: SHAPE_VERSION,
      source: 'gate1_approved',
      approvedAt: new Date().toISOString(),
      approvedBaselineVersion,
      sourceSnapshotVersion: draft.meta?.sourceSnapshotVersion || null,
      draftRevisionId: nextDraftRevision(opts.currentDraftRevisionId ?? draft.meta?.draftRevisionId),
      publishable: true,
    },
  };

  return {
    ok: true,
    approvedBacklogStructure: approved,
    approvedBaselineVersion,
  };
}

/**
 * Materialize planning backlog from approved backlog structure (includes Features).
 */
function materializeBacklogStructureFromApproved(approved) {
  if (!approved || typeof approved !== 'object') return null;
  const epics = Array.isArray(approved.epics) ? approved.epics : [];
  const features = Array.isArray(approved.features) ? approved.features : [];
  const stories = Array.isArray(approved.stories) ? approved.stories : [];

  // Reject legacy Story id = FR id when claiming backlog-structure
  if (approved.meta?.shapeVersion === SHAPE_VERSION) {
    for (const s of stories) {
      if (!isStoryId(s.id)) return null;
      const frs = (s.sourceFrIds || []).map(String);
      if (frs.includes(String(s.id))) return null;
    }
  }

  return {
    epics: epics.map((e) => ({
      id: e.id,
      name: e.name || e.title,
      parentId: null,
      level: 'epic',
      sourceFrIds: [...(e.sourceFrIds || [])],
      featureIds: [...(e.featureIds || [])],
      storyIds: [...(e.storyIds || [])],
      epicOrigin: 'approved_backlog_structure',
    })),
    features: features.map((f) => ({
      id: f.id,
      name: f.name || f.title,
      parentId: f.parentEpicId || null,
      level: 'feature',
      sourceFrIds: [...(f.sourceFrIds || [])],
      storyIds: [...(f.storyIds || [])],
    })),
    stories: stories.map((s) => ({
      id: s.id,
      name: s.name || s.title,
      description: s.description || '',
      parentId: s.parentFeatureId || s.parentEpicId || null,
      parentFeatureId: s.parentFeatureId || null,
      parentEpicId: s.parentFeatureId ? null : s.parentEpicId || null,
      level: 'story',
      sourceFrIds: [...(s.sourceFrIds || [])],
      acRefs: [...(s.acRefs || [])],
      needsDecomposition: s.needsDecomposition !== false,
      classificationDecision: s.classificationDecision,
      lineage: s.lineage,
    })),
    unmappedFrIds: Array.isArray(approved.unmappedFrIds) ? [...approved.unmappedFrIds] : [],
    coverageByFrId: approved.coverageByFrId || {},
    coverageByAcRef: approved.coverageByAcRef || {},
    meta: {
      source: 'approved_backlog_structure',
      shapeVersion: SHAPE_VERSION,
      storyCount: stories.length,
      epicCount: epics.length,
      featureCount: features.length,
      approvedBaselineVersion: approved.meta?.approvedBaselineVersion || null,
      sourceSnapshotVersion: approved.meta?.sourceSnapshotVersion || null,
    },
  };
}

/**
 * HOW binds tasks to story.id + approvedBaselineVersion.
 */
function bindHowToApprovedBaseline(opts = {}) {
  const approved = opts.approvedBacklogStructure;
  const tasks = Array.isArray(opts.tasks) ? opts.tasks : [];
  if (!approved?.meta?.approvedBaselineVersion) {
    return { ok: false, code: 'MISSING_APPROVED_BASELINE_VERSION' };
  }
  const storyIds = new Set((approved.stories || []).map((s) => String(s.id)));
  const bound = [];
  const errors = [];
  for (const t of tasks) {
    const storyId = String(t.storyId || t.parentStoryId || '').trim();
    if (!storyId || !storyIds.has(storyId)) {
      errors.push(`task_unbound_story_${t.id || '?'}_${storyId}`);
      continue;
    }
    if (!isStoryId(storyId)) {
      errors.push(`task_legacy_fr_story_id_${storyId}`);
      continue;
    }
    bound.push({
      ...t,
      storyId,
      approvedBaselineVersion: approved.meta.approvedBaselineVersion,
      sourceSnapshotVersion: approved.meta.sourceSnapshotVersion || null,
      howStale: false,
    });
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    tasks: bound,
    approvedBaselineVersion: approved.meta.approvedBaselineVersion,
  };
}

/**
 * On Gate1 re-approve with new baseline → mark HOW tasks stale (no silent merge).
 */
function markHowStaleOnReapprove(opts = {}) {
  const prevVersion = String(opts.previousApprovedBaselineVersion || '');
  const nextVersion = String(opts.nextApprovedBaselineVersion || '');
  const tasks = Array.isArray(opts.tasks) ? opts.tasks : [];
  if (!nextVersion || prevVersion === nextVersion) {
    return { ok: true, tasks, staleCount: 0 };
  }
  let staleCount = 0;
  const next = tasks.map((t) => {
    const bound = String(t.approvedBaselineVersion || '');
    if (bound && bound !== nextVersion) {
      staleCount += 1;
      return {
        ...t,
        howStale: true,
        staleReason: 'gate1_reapproved_new_baseline',
        previousApprovedBaselineVersion: bound,
        approvedBaselineVersion: nextVersion,
      };
    }
    return { ...t, approvedBaselineVersion: nextVersion, howStale: false };
  });
  return { ok: true, tasks: next, staleCount };
}

/**
 * After cutover: detect / strip stories where id === frId (legacy).
 */
function purgeFrIdAsStoryId(structure = {}) {
  const stories = Array.isArray(structure.stories) ? structure.stories : [];
  const kept = [];
  const purged = [];
  for (const s of stories) {
    const id = String(s.id || '');
    const frs = (s.sourceFrIds || []).map(String);
    if (!isStoryId(id) || frs.includes(id)) {
      purged.push(id);
      continue;
    }
    kept.push(s);
  }
  return {
    ...structure,
    stories: kept,
    meta: {
      ...(structure.meta || {}),
      purgedFrIdStoryIds: purged,
      shapeVersion: SHAPE_VERSION,
    },
  };
}

function isBacklogStructureShape(structure) {
  return (
    structure &&
    typeof structure === 'object' &&
    (isBacklogStructureShapeVersion(structure.meta?.shapeVersion) ||
      String(structure.meta?.backlogSource || '') === 'backlog_structure' ||
      String(structure.meta?.backlogSource || '') === 'backlog_structure_v3')
  );
}

module.exports = {
  assertCanApproveBacklogEntity,
  approveBacklogDraft,
  materializeBacklogStructureFromApproved,
  bindHowToApprovedBaseline,
  markHowStaleOnReapprove,
  purgeFrIdAsStoryId,
  isBacklogStructureShape,
  COVERAGE_STATUS,
  isStoryId,
  isFeatureId,
  isEpicId,
};
