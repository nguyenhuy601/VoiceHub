/**
 * Validate LLM candidates (temp refs) + sources BEFORE reconcile.
 */

const { CLASSIFICATION_TYPES } = require('./constants');

function asIdList(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x || '').trim()).filter(Boolean);
}

function hasClassification(entity, expectedType) {
  const cd = entity?.classificationDecision;
  if (!cd || typeof cd !== 'object') return false;
  const t = String(cd.type || cd.kind || expectedType || '').toUpperCase();
  if (expectedType && t !== expectedType) return false;
  if (!String(cd.summary || '').trim()) return false;
  const evidence = asIdList(cd.evidenceRefs);
  if (t !== CLASSIFICATION_TYPES.UNCLEAR && !evidence.length) return false;
  if (t === CLASSIFICATION_TYPES.STORY) {
    if (!String(cd.beneficiary || cd.actor || '').trim() && !String(cd.behavior || '').trim()) {
      // allow summary-only if AC refs present on entity
      if (!asIdList(entity.acRefs).length) return false;
    }
  }
  if (t === CLASSIFICATION_TYPES.EPIC && !Array.isArray(cd.capabilities) && !String(cd.summary).includes(' ')) {
    return Boolean(String(cd.summary || '').trim());
  }
  return true;
}

/**
 * @param {object} candidate — { epics, features, stories } with tempId/tempRef
 * @param {{ frAllowList: Set<string>|string[], acAllowList?: Set<string>|string[], evidenceAllowList?: Set<string>|string[] }} ctx
 */
function acceptBacklogCandidates(candidate = {}, ctx = {}) {
  const errors = [];
  const warnings = [];
  const frAllow = new Set(
    (ctx.frAllowList instanceof Set
      ? [...ctx.frAllowList]
      : Array.isArray(ctx.frAllowList)
        ? ctx.frAllowList
        : []
    ).map(String)
  );
  const acAllow = new Set(
    (ctx.acAllowList instanceof Set
      ? [...ctx.acAllowList]
      : Array.isArray(ctx.acAllowList)
        ? ctx.acAllowList
        : []
    ).map(String)
  );
  const evidenceAllow = new Set(
    (ctx.evidenceAllowList instanceof Set
      ? [...ctx.evidenceAllowList]
      : Array.isArray(ctx.evidenceAllowList)
        ? ctx.evidenceAllowList
        : []
    ).map(String)
  );

  const epics = Array.isArray(candidate.epics) ? candidate.epics : [];
  const features = Array.isArray(candidate.features) ? candidate.features : [];
  const stories = Array.isArray(candidate.stories) ? candidate.stories : [];

  const tempIds = new Set();
  function claimTemp(raw, kind, index) {
    const id = String(raw?.tempId || raw?.tempRef || raw?.id || '').trim();
    if (!id) {
      errors.push(`${kind}_${index}_missing_tempId`);
      return null;
    }
    if (tempIds.has(id)) {
      errors.push(`${kind}_duplicate_tempId_${id}`);
      return null;
    }
    tempIds.add(id);
    return id;
  }

  function checkSources(entity, kind, index) {
    const frs = asIdList(entity.sourceFrIds);
    for (const fr of frs) {
      if (frAllow.size && !frAllow.has(fr)) {
        errors.push(`${kind}_${index}_unknown_fr_${fr}`);
      }
    }
    const acs = asIdList(entity.acRefs);
    for (const ac of acs) {
      if (acAllow.size && !acAllow.has(ac)) {
        errors.push(`${kind}_${index}_unknown_ac_${ac}`);
      }
    }
    const ev = asIdList(entity.classificationDecision?.evidenceRefs);
    for (const e of ev) {
      if (evidenceAllow.size && !evidenceAllow.has(e)) {
        errors.push(`${kind}_${index}_unresolved_evidence_${e}`);
      }
    }
    if (kind !== 'epic' && !frs.length && kind === 'story') {
      errors.push(`story_${index}_missing_sourceFrIds`);
    }
  }

  const normalized = { epics: [], features: [], stories: [] };

  epics.forEach((row, i) => {
    const tempId = claimTemp(row, 'epic', i);
    if (!tempId) return;
    if (!String(row.title || row.name || '').trim()) {
      errors.push(`epic_${i}_missing_title`);
      return;
    }
    if (!hasClassification(row, CLASSIFICATION_TYPES.EPIC)) {
      errors.push(`epic_${i}_classification_incomplete`);
      return;
    }
    checkSources(row, 'epic', i);
    normalized.epics.push({
      ...row,
      tempId,
      title: String(row.title || row.name).trim(),
      sourceFrIds: asIdList(row.sourceFrIds),
      classificationDecision: {
        type: CLASSIFICATION_TYPES.EPIC,
        ...row.classificationDecision,
        evidenceRefs: asIdList(row.classificationDecision?.evidenceRefs),
      },
    });
  });

  features.forEach((row, i) => {
    const tempId = claimTemp(row, 'feature', i);
    if (!tempId) return;
    if (!String(row.title || row.name || '').trim()) {
      errors.push(`feature_${i}_missing_title`);
      return;
    }
    if (!hasClassification(row, CLASSIFICATION_TYPES.FEATURE)) {
      errors.push(`feature_${i}_classification_incomplete`);
      return;
    }
    checkSources(row, 'feature', i);
    normalized.features.push({
      ...row,
      tempId,
      title: String(row.title || row.name).trim(),
      parentEpicTempId: row.parentEpicTempId || row.parentEpicId || null,
      sourceFrIds: asIdList(row.sourceFrIds),
      classificationDecision: {
        type: CLASSIFICATION_TYPES.FEATURE,
        ...row.classificationDecision,
        evidenceRefs: asIdList(row.classificationDecision?.evidenceRefs),
      },
    });
  });

  stories.forEach((row, i) => {
    const tempId = claimTemp(row, 'story', i);
    if (!tempId) return;
    if (!String(row.title || row.name || '').trim()) {
      errors.push(`story_${i}_missing_title`);
      return;
    }
    const cdType = String(row.classificationDecision?.type || CLASSIFICATION_TYPES.STORY).toUpperCase();
    if (cdType === CLASSIFICATION_TYPES.UNCLEAR) {
      warnings.push(`story_${i}_unclear_classification`);
    } else if (!hasClassification(row, CLASSIFICATION_TYPES.STORY)) {
      errors.push(`story_${i}_classification_incomplete`);
      return;
    }
    checkSources(row, 'story', i);
    const parentFeatureTempId = row.parentFeatureTempId || row.parentFeatureId || null;
    const parentEpicTempId = row.parentEpicTempId || row.parentEpicId || null;
    if (parentFeatureTempId && parentEpicTempId) {
      // Story under Feature must not also set Epic on story (will clear epic later)
      warnings.push(`story_${i}_both_parents_feature_wins`);
    }
    normalized.stories.push({
      ...row,
      tempId,
      title: String(row.title || row.name).trim(),
      parentFeatureTempId: parentFeatureTempId || null,
      parentEpicTempId: parentFeatureTempId ? null : parentEpicTempId || null,
      sourceFrIds: asIdList(row.sourceFrIds),
      acRefs: asIdList(row.acRefs),
      classificationDecision: {
        type: cdType === CLASSIFICATION_TYPES.UNCLEAR ? CLASSIFICATION_TYPES.UNCLEAR : CLASSIFICATION_TYPES.STORY,
        ...row.classificationDecision,
        evidenceRefs: asIdList(row.classificationDecision?.evidenceRefs),
      },
    });
  });

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    candidates: normalized,
  };
}

module.exports = {
  acceptBacklogCandidates,
  hasClassification,
};
