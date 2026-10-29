/**
 * Story SoT AC contract (mirror of APS engines/storyAcContract).
 * acRefs required + resolvable against FR.AC whitelist (`${frId}:AC-n`).
 */

const REASON = {
  MISSING_ACCEPTANCE_CRITERIA: 'MISSING_ACCEPTANCE_CRITERIA',
  INVALID_SOURCE_REF: 'INVALID_SOURCE_REF',
};

function asList(raw) {
  return Array.isArray(raw) ? raw : [];
}

function normalizeId(raw) {
  return String(raw || '').trim();
}

function normalizeAcKey(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[.…]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractFrAcLines(fr) {
  if (fr == null) return [];
  if (typeof fr === 'string') {
    return fr
      .split(/\n|;/)
      .map((s) => s.replace(/^[-*•\d.)\s]+/, '').trim())
      .filter(Boolean);
  }
  const ac = fr.ac != null ? fr.ac : fr.acceptanceCriteria;
  if (Array.isArray(ac)) {
    return ac
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        return String(item?.text || item?.statement || item?.description || '').trim();
      })
      .filter(Boolean);
  }
  if (typeof ac !== 'string' || !ac.trim()) return [];
  return ac
    .split(/\n|;/)
    .map((s) => s.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter(Boolean);
}

function buildFrAcIndex(frItems = []) {
  const byFr = new Map();
  for (const fr of asList(frItems)) {
    const frId = normalizeId(fr?.id || fr?.logicalId || fr?.frId || fr?.externalId);
    if (!frId) continue;
    const lines = extractFrAcLines(fr);
    const keys = new Set();
    const texts = new Set();
    lines.forEach((line, j) => {
      keys.add(`${frId}:AC-${j + 1}`);
      texts.add(normalizeAcKey(line));
    });
    byFr.set(frId, { keys, texts, lines });
  }
  return byFr;
}

function allowlistForFrIds(frAcIndex, frIds = []) {
  const keys = new Set();
  const texts = new Set();
  let lineCount = 0;
  for (const id of asList(frIds).map(normalizeId).filter(Boolean)) {
    const row = frAcIndex.get(id);
    if (!row) continue;
    for (const k of row.keys) keys.add(k);
    for (const t of row.texts) texts.add(t);
    lineCount += row.lines.length;
  }
  return { keys, texts, lineCount };
}

function acRefResolves(ref, allow) {
  const raw = normalizeId(ref);
  if (!raw) return false;
  if (allow.keys.has(raw)) return true;
  const lower = raw.toLowerCase();
  for (const k of allow.keys) {
    if (k.toLowerCase() === lower) return true;
  }
  const textKey = normalizeAcKey(raw);
  if (textKey && allow.texts.has(textKey)) return true;
  return false;
}

function validateStoryAcContract(story, frItemsOrIndex = []) {
  const reasonCodes = [];
  const invalidRefs = [];
  const frIds = asList(story?.sourceFrIds || story?.fr)
    .map(normalizeId)
    .filter(Boolean);
  if (!frIds.length) {
    reasonCodes.push(REASON.MISSING_ACCEPTANCE_CRITERIA);
    return { ok: false, reasonCodes, invalidRefs };
  }

  const index =
    frItemsOrIndex instanceof Map ? frItemsOrIndex : buildFrAcIndex(frItemsOrIndex);
  const allow = allowlistForFrIds(index, frIds);

  if (allow.lineCount <= 0) {
    reasonCodes.push(REASON.MISSING_ACCEPTANCE_CRITERIA);
    return { ok: false, reasonCodes, invalidRefs };
  }

  const acRefs = asList(story?.acRefs || story?.ac)
    .map(normalizeId)
    .filter(Boolean);
  if (!acRefs.length) {
    reasonCodes.push(REASON.MISSING_ACCEPTANCE_CRITERIA);
    return { ok: false, reasonCodes, invalidRefs };
  }

  for (const ref of acRefs) {
    if (!acRefResolves(ref, allow)) {
      invalidRefs.push(ref);
    }
  }
  if (invalidRefs.length) {
    reasonCodes.push(REASON.INVALID_SOURCE_REF);
    return { ok: false, reasonCodes, invalidRefs };
  }

  return { ok: true, reasonCodes: [], invalidRefs: [] };
}

function filterStoriesByAcContract(stories = [], frItems = []) {
  const index = buildFrAcIndex(frItems);
  const kept = [];
  const rejected = [];
  const reasonCodes = new Set();
  for (const story of asList(stories)) {
    if (!story) continue;
    const result = validateStoryAcContract(story, index);
    if (result.ok) {
      kept.push(story);
    } else {
      rejected.push({
        id: normalizeId(story.id || story.logicalId),
        reasonCodes: result.reasonCodes,
        invalidRefs: result.invalidRefs,
      });
      for (const c of result.reasonCodes) reasonCodes.add(c);
    }
  }
  return {
    stories: kept,
    rejected,
    reasonCodes: [...reasonCodes],
  };
}

function storyHasAcRefsShape(story) {
  return asList(story?.acRefs || story?.ac).map(normalizeId).filter(Boolean).length > 0;
}

module.exports = {
  REASON,
  extractFrAcLines,
  buildFrAcIndex,
  allowlistForFrIds,
  acRefResolves,
  validateStoryAcContract,
  filterStoriesByAcContract,
  storyHasAcRefsShape,
};
