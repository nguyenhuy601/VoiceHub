/**
 * Slim pack/capabilities for WBS LLM — only fields required for leaf naming + hierarchy wrap.
 * Avoid shipping full SRS / UC / NFR / PII into queue jobs or prompts.
 */

function truncate(text, max) {
  const s = String(text || '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

function listFrRows(pack = {}) {
  if (Array.isArray(pack.functionalRequirements)) return pack.functionalRequirements;
  if (Array.isArray(pack.frList)) return pack.frList;
  if (Array.isArray(pack.requirements)) return pack.requirements;
  return [];
}

function rowId(row, index = 0) {
  return String(row?.externalId || row?.id || row?._id || `FR-${index + 1}`).trim();
}

function compactAc(row, maxLen = 120) {
  const raw = row?.ac || row?.acceptanceCriteria || '';
  if (Array.isArray(row?.acceptanceCriteriaList)) {
    return row.acceptanceCriteriaList
      .map((x) => truncate(x, 40))
      .filter(Boolean)
      .slice(0, 2)
      .join('\n')
      .slice(0, maxLen);
  }
  if (typeof raw !== 'string' || !raw.trim()) return '';
  return truncate(
    raw
      .split(/\n|;/)
      .map((s) => s.replace(/^[-*•\d.)\s]+/, '').trim())
      .filter((s) => s.length >= 3)
      .slice(0, 2)
      .join('\n'),
    maxLen
  );
}

/**
 * @param {object} pack
 * @returns {object} compact pack with functionalRequirements only
 */
function compactPackForWbsLlm(pack = {}, opts = {}) {
  const { compileContext } = require('../dataPlane/compileContext');
  const compiled = compileContext({
    phase: 'HOW',
    profile: 'WBS_STORY',
    pack,
    container: opts.container,
    stories: opts.stories,
    snapshot: opts.snapshot,
    snapshotId: opts.snapshotId,
    budget: opts.budget,
  });
  const seen = new Set();
  const frs = [];
  for (const unit of compiled.workUnits || []) {
    for (const row of unit.entities?.functionalRequirements || []) {
      if (seen.has(row.entityId)) continue;
      seen.add(row.entityId);
      const out = {
        externalId: row.content?.code || row.entityId,
        name: row.content?.title || row.entityId,
        description: row.content?.description || '',
      };
      if (row.content?.moduleId) out.module = row.content.moduleId;
      if (row.content?.feature) out.feature = row.content.feature;
      const ac = (row.content?.acceptanceCriteria || []).map((item) => item.text).filter(Boolean);
      if (ac.length) out.acceptanceCriteria = ac.join('\n');
      frs.push(out);
    }
  }
  return {
    functionalRequirements: frs,
    contextStatus: compiled.status,
    contextCoverage: compiled.coverage,
  };
}

/**
 * @param {object[]} capabilities
 * @returns {object[]}
 */
function compactCapabilitiesForWbsLlm(capabilities = []) {
  return (Array.isArray(capabilities) ? capabilities : [])
    .slice(0, 40)
    .map((c) => {
      const item = {
        capabilityId: c.capabilityId || c.id,
        name: truncate(c.name, 60),
      };
      if (Array.isArray(c.sourceFrIds) && c.sourceFrIds.length) {
        item.sourceFrIds = c.sourceFrIds.slice(0, 6).map(String);
      }
      if (c.complexity) item.complexity = c.complexity;
      return item;
    })
    .filter((c) => c.capabilityId);
}

module.exports = {
  compactPackForWbsLlm,
  compactCapabilitiesForWbsLlm,
  listFrRows,
  rowId,
};
