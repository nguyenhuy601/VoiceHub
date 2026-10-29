/**
 * Resolve parent temp refs → final entity IDs after keep/mint.
 */

function resolveBacklogParents(entities, tempRefMap = {}) {
  const errors = [];
  const map = tempRefMap && typeof tempRefMap === 'object' ? tempRefMap : {};

  function resolveRef(raw, field, ownerId) {
    if (raw == null || raw === '') return null;
    const key = String(raw).trim();
    if (map[key]) return map[key];
    // already a final id
    if (/^(EPIC|FEATURE|STORY)[-_]/i.test(key)) return key;
    errors.push(`unresolved_parent_${field}_${ownerId}_${key}`);
    return null;
  }

  const epics = (entities.epics || []).map((e) => ({ ...e }));
  const features = (entities.features || []).map((f) => {
    const parentEpicId = resolveRef(f.parentEpicTempId || f.parentEpicId, 'parentEpicId', f.id || f.tempId);
    return {
      ...f,
      parentEpicId,
      parentEpicTempId: undefined,
    };
  });
  const stories = (entities.stories || []).map((s) => {
    let parentFeatureId = resolveRef(
      s.parentFeatureTempId || s.parentFeatureId,
      'parentFeatureId',
      s.id || s.tempId
    );
    let parentEpicId = resolveRef(s.parentEpicTempId || s.parentEpicId, 'parentEpicId', s.id || s.tempId);
    // Feature wins — clear epic on story when under feature
    if (parentFeatureId) parentEpicId = null;
    return {
      ...s,
      parentFeatureId,
      parentEpicId,
      parentFeatureTempId: undefined,
      parentEpicTempId: undefined,
    };
  });

  return {
    ok: errors.length === 0,
    errors,
    entities: { epics, features, stories },
  };
}

module.exports = { resolveBacklogParents };
