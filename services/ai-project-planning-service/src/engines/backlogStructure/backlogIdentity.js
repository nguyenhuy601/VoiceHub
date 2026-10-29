/**
 * Mint entity IDs only AFTER reconcile decides NEW (and identity not pending review).
 * IDs are independent of FR ids / titles / ordinals.
 */

const crypto = require('crypto');

function shortToken(bytes = 4) {
  return crypto.randomBytes(bytes).toString('hex');
}

function mintEpicId() {
  return `EPIC-${shortToken(5)}`;
}

function mintFeatureId() {
  return `FEATURE-${shortToken(6)}`;
}

function mintStoryId() {
  return `STORY-${shortToken(6)}`;
}

function isEpicId(raw) {
  return /^EPIC[-_]/i.test(String(raw || '').trim());
}

function isFeatureId(raw) {
  return /^FEATURE[-_]/i.test(String(raw || '').trim());
}

function isStoryId(raw) {
  return /^STORY[-_]/i.test(String(raw || '').trim());
}

/**
 * Bidirectional FR ↔ Story index.
 * @param {object[]} stories
 * @returns {{ frToStories: Map<string, Set<string>>, storyToFrs: Map<string, Set<string>> }}
 */
function buildFrStoryIndex(stories = []) {
  const frToStories = new Map();
  const storyToFrs = new Map();
  for (const s of Array.isArray(stories) ? stories : []) {
    const sid = String(s?.id || '').trim();
    if (!sid) continue;
    const frs = Array.isArray(s.sourceFrIds) ? s.sourceFrIds.map(String).filter(Boolean) : [];
    if (!storyToFrs.has(sid)) storyToFrs.set(sid, new Set());
    for (const fr of frs) {
      storyToFrs.get(sid).add(fr);
      if (!frToStories.has(fr)) frToStories.set(fr, new Set());
      frToStories.get(fr).add(sid);
    }
  }
  return { frToStories, storyToFrs };
}

/**
 * Bidirectional FR ↔ Feature index.
 */
function buildFrFeatureIndex(features = []) {
  const frToFeatures = new Map();
  const featureToFrs = new Map();
  for (const f of Array.isArray(features) ? features : []) {
    const fid = String(f?.id || '').trim();
    if (!fid) continue;
    const frs = Array.isArray(f.sourceFrIds) ? f.sourceFrIds.map(String).filter(Boolean) : [];
    if (!featureToFrs.has(fid)) featureToFrs.set(fid, new Set());
    for (const fr of frs) {
      featureToFrs.get(fid).add(fr);
      if (!frToFeatures.has(fr)) frToFeatures.set(fr, new Set());
      frToFeatures.get(fr).add(fid);
    }
  }
  return { frToFeatures, featureToFrs };
}

/**
 * Recompute parent storyIds / featureIds from direct parent links.
 */
function recomputeParentIndexes(structure = {}) {
  const epics = Array.isArray(structure.epics) ? structure.epics.map((e) => ({ ...e })) : [];
  const features = Array.isArray(structure.features)
    ? structure.features.map((f) => ({ ...f }))
    : [];
  const stories = Array.isArray(structure.stories) ? structure.stories.map((s) => ({ ...s })) : [];

  for (const e of epics) {
    e.featureIds = [];
    e.storyIds = [];
  }
  for (const f of features) {
    f.storyIds = [];
  }

  const epicById = new Map(epics.map((e) => [e.id, e]));
  const featureById = new Map(features.map((f) => [f.id, f]));

  for (const f of features) {
    const pid = f.parentEpicId || null;
    if (pid && epicById.has(pid)) {
      epicById.get(pid).featureIds.push(f.id);
    }
  }
  for (const s of stories) {
    const pf = s.parentFeatureId || null;
    const pe = s.parentEpicId || null;
    if (pf && featureById.has(pf)) {
      featureById.get(pf).storyIds.push(s.id);
    } else if (pe && epicById.has(pe)) {
      epicById.get(pe).storyIds.push(s.id);
    }
  }

  return { epics, features, stories };
}

module.exports = {
  mintEpicId,
  mintFeatureId,
  mintStoryId,
  isEpicId,
  isFeatureId,
  isStoryId,
  buildFrStoryIndex,
  buildFrFeatureIndex,
  recomputeParentIndexes,
};
