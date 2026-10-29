/**
 * Final contract validate after IDs + parents resolved.
 */

const { recomputeParentIndexes, isFeatureId, isEpicId, isStoryId } = require('./backlogIdentity');
const { SHAPE_VERSION } = require('./constants');

function acceptBacklogStructure(structure = {}, opts = {}) {
  const errors = [];
  const epics = Array.isArray(structure.epics) ? structure.epics : [];
  const features = Array.isArray(structure.features) ? structure.features : [];
  const stories = Array.isArray(structure.stories) ? structure.stories : [];

  const epicIds = new Set(epics.map((e) => e.id).filter(Boolean));
  const featureIds = new Set(features.map((f) => f.id).filter(Boolean));
  const storyIds = new Set();

  for (const e of epics) {
    if (!e.id || !isEpicId(e.id)) errors.push(`epic_invalid_id_${e.id || '?'}`);
    if (!String(e.title || e.name || '').trim()) errors.push(`epic_missing_title_${e.id}`);
  }
  for (const f of features) {
    if (!f.id || !isFeatureId(f.id)) errors.push(`feature_invalid_id_${f.id || '?'}`);
    if (!String(f.title || f.name || '').trim()) errors.push(`feature_missing_title_${f.id}`);
    if (f.parentEpicId != null && f.parentEpicId !== '' && !epicIds.has(f.parentEpicId)) {
      errors.push(`feature_dangling_parentEpic_${f.id}_${f.parentEpicId}`);
    }
  }
  for (const s of stories) {
    if (!s.id || !isStoryId(s.id)) errors.push(`story_invalid_id_${s.id || '?'}`);
    if (storyIds.has(s.id)) errors.push(`story_duplicate_id_${s.id}`);
    storyIds.add(s.id);
    if (!String(s.title || s.name || '').trim()) errors.push(`story_missing_title_${s.id}`);
    if (!Array.isArray(s.sourceFrIds) || !s.sourceFrIds.length) {
      errors.push(`story_missing_sourceFrIds_${s.id}`);
    }
    // parent null = OK; dangling = error
    if (s.parentFeatureId != null && s.parentFeatureId !== '') {
      if (!featureIds.has(s.parentFeatureId)) {
        errors.push(`story_dangling_parentFeature_${s.id}_${s.parentFeatureId}`);
      }
      if (s.parentEpicId != null && s.parentEpicId !== '') {
        errors.push(`story_both_parents_${s.id}`);
      }
    } else if (s.parentEpicId != null && s.parentEpicId !== '') {
      if (!epicIds.has(s.parentEpicId)) {
        errors.push(`story_dangling_parentEpic_${s.id}_${s.parentEpicId}`);
      }
    }
    // Independent story (both null) is valid
  }

  if (errors.length) {
    return { ok: false, errors };
  }

  const indexed = recomputeParentIndexes({ epics, features, stories });
  const frAllow = opts.frAllowList instanceof Set ? opts.frAllowList : new Set(opts.frAllowList || []);
  if (frAllow.size) {
    for (const s of indexed.stories) {
      for (const fr of s.sourceFrIds || []) {
        if (!frAllow.has(String(fr))) errors.push(`story_${s.id}_unknown_fr_${fr}`);
      }
    }
  }
  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    backlogStructure: {
      ...indexed,
      unmappedFrIds: Array.isArray(structure.unmappedFrIds) ? structure.unmappedFrIds : [],
      openQuestions: Array.isArray(structure.openQuestions) ? structure.openQuestions : [],
      identityReview: Array.isArray(structure.identityReview) ? structure.identityReview : [],
      coverageByFrId: structure.coverageByFrId || {},
      coverageByAcRef: structure.coverageByAcRef || {},
      meta: {
        ...(structure.meta || {}),
        shapeVersion: SHAPE_VERSION,
        epicCount: indexed.epics.length,
        featureCount: indexed.features.length,
        storyCount: indexed.stories.length,
        publishable: structure.meta?.publishable !== false,
      },
    },
  };
}

module.exports = { acceptBacklogStructure };
