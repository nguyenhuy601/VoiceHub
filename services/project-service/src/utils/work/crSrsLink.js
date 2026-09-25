/**
 * Plan R5 — CR link to SRS baseline + affected analysis keys (pure).
 */

function normalizeAffectedExternalKeys(raw) {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[,;\s]+/) : [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const key = String(item || '')
      .trim()
      .slice(0, 64);
    if (!key) continue;
    const k = key.toUpperCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(key);
    if (out.length >= 40) break;
  }
  return out;
}

function normalizeSrsBaselineId(raw) {
  const id = String(raw || '').trim();
  if (!id || !/^[a-fA-F0-9]{24}$/.test(id)) return null;
  return id;
}

/**
 * @returns {{ ok: true, srsBaselineId: string|null, affectedExternalKeys: string[] } | { ok: false, errorCode: string, message: string }}
 */
function assertCrSrsLinkFields({
  type,
  srsBaselineId,
  affectedExternalKeys,
  projectHasSrsBaseline = false,
  baselineBelongsToProject = true,
}) {
  const crType = String(type || '').trim().toLowerCase();
  const baselineId = normalizeSrsBaselineId(srsBaselineId);
  const keys = normalizeAffectedExternalKeys(affectedExternalKeys);
  const requireLink = projectHasSrsBaseline && crType === 'requirement_change';

  if (requireLink) {
    if (!baselineId) {
      return {
        ok: false,
        errorCode: 'CR_SRS_BASELINE_REQUIRED',
        message: 'requirement_change sau SRS cần srsBaselineId',
      };
    }
    if (!baselineBelongsToProject) {
      return {
        ok: false,
        errorCode: 'CR_SRS_BASELINE_INVALID',
        message: 'srsBaselineId không thuộc project',
      };
    }
    if (!keys.length) {
      return {
        ok: false,
        errorCode: 'CR_AFFECTED_KEYS_REQUIRED',
        message: 'requirement_change sau SRS cần affectedExternalKeys (vd. FR-…)',
      };
    }
  }

  if (baselineId && !baselineBelongsToProject) {
    return {
      ok: false,
      errorCode: 'CR_SRS_BASELINE_INVALID',
      message: 'srsBaselineId không thuộc project',
    };
  }

  return { ok: true, srsBaselineId: baselineId, affectedExternalKeys: keys };
}

module.exports = {
  normalizeAffectedExternalKeys,
  normalizeSrsBaselineId,
  assertCrSrsLinkFields,
};
