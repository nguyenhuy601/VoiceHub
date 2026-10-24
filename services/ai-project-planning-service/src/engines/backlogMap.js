/**
 * BacklogMap — deterministic SRS → Agile backlog.
 *
 * Hierarchy is contextual (not always Epic→Feature→Story):
 * - Epic = business outcome (BG)
 * - Feature = product capability only when warranted (explicit feature / capability /
 *   shared real module with ≥2 stories under the same Epic)
 * - Story = concrete PBI (analyzed FR/UC) — may parent directly under Epic
 *
 * Customer Raw input (CR-*) and standalone NFR are NOT backlog stories / WBS LLM targets.
 * FR ≠ Story identity; UC may group multiple FRs; unmappedFrIds for coverage.
 */

function compactToken(raw, prefix = 'x') {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 24);
  return s || prefix;
}

/**
 * Customer Raw requirement ids (CR-002, CR002, CR.059, cr059) — input, not analyzed FR.
 * Does not match CR-ROLE-* style demo labels without a numeric CR body.
 */
function isCustomerRequirementId(raw) {
  const s = String(raw || '').trim();
  if (!s) return false;
  if (/^(CR)[-_.\s]?\d+/i.test(s)) return true;
  // After compactToken: "CR-059" / "CR.059" → "cr059"
  const compact = s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return /^cr\d+$/i.test(compact);
}

/** True when UC id itself is Customer Raw (never a WBS story seed). */
function isCustomerRequirementUcId(raw) {
  return isCustomerRequirementId(raw);
}

/**
 * Stories that must not enter backlog / WBS / Gate2 tasks:
 * CR input (STORY-cr*), NFR-only (STORY-NFR-*), any NFR-primary row, CR-only FR cites.
 */
function isExcludedFromWbsDecomposition(story) {
  if (!story || typeof story !== 'object') return true;
  const id = String(story.id || '').trim();
  // Id patterns (legacy + current compactToken of CR-*).
  if (/^STORY-NFR[-_]/i.test(id)) return true;
  if (/^STORY-cr\d+/i.test(id)) return true;
  if (/^STORY-UC-cr\d+/i.test(id)) return true;
  const frIds = (Array.isArray(story.sourceFrIds) ? story.sourceFrIds : [])
    .map((x) => String(x || '').trim())
    .filter(Boolean);
  const nfrIds = (Array.isArray(story.sourceNfrIds) ? story.sourceNfrIds : [])
    .map((x) => String(x || '').trim())
    .filter(Boolean);
  const ucIds = (Array.isArray(story.sourceUcIds) ? story.sourceUcIds : [])
    .map((x) => String(x || '').trim())
    .filter(Boolean);
  // NFR is out of HOW backlog/WBS scope entirely (no soft-trace analysis).
  if (nfrIds.length > 0) return true;
  if (ucIds.length > 0 && ucIds.every(isCustomerRequirementUcId) && frIds.every(isCustomerRequirementId)) {
    return true;
  }
  if (frIds.length > 0 && frIds.every(isCustomerRequirementId)) return true;
  if (!frIds.length && !ucIds.length) return true;
  return false;
}

/**
 * Product path: map Gate1-approved Epic→Story SoT only (no FR→Story invent).
 * @param {object} opts
 * @param {object} opts.pack
 * @param {object} [opts.container]
 * @param {object} [opts.toolData]
 * @param {object} [opts.approvedBacklogStructure]
 * @param {object[]} [opts.capabilities] — ignored on SoT path (compat)
 * @param {object|null} [opts.planningHints] — ignored on SoT path (compat)
 */
function runBacklogMapEngine(opts = {}) {
  const {
    runBacklogStructureMap,
  } = require('./backlogStructureMap');
  const mapped = runBacklogStructureMap(opts);
  if (mapped.ok) {
    return { backlog: mapped.backlog, meta: mapped.meta, status: 'ready' };
  }
  console.error(
    '[BacklogMap] fail-closed',
    (mapped.meta?.reasonCodes || []).join(';') || 'missing_approved_backlog_structure'
  );
  return {
    status: 'error',
    backlog: {
      epics: [],
      features: [],
      stories: [],
      unmappedFrIds: [],
      meta: mapped.meta,
    },
    meta: mapped.meta,
  };
}

/**
 * Materialize backlog nodes as planning.tasks-compatible rows (for Dep/Effort/Gate2).
 */
function backlogNodesAsTasks(backlog = {}) {
  const out = [];
  for (const e of backlog.epics || []) {
    out.push({
      id: e.id,
      name: e.name,
      parentId: null,
      level: 'epic',
      sourceBgIds: e.sourceBgIds || [],
      suggestedRoleKey: 'project_manager',
      effortSeedHours: 0,
      effortHours: 0,
    });
  }
  for (const f of backlog.features || []) {
    out.push({
      id: f.id,
      name: f.name,
      parentId: f.parentId,
      level: 'feature',
      sourceCapabilityIds: f.sourceCapabilityIds || [],
      // Capability owner — Gate2 Role column (containers had blank before).
      suggestedRoleKey: 'technical_lead',
      effortSeedHours: 0,
      effortHours: 0,
    });
  }
  for (const s of backlog.stories || []) {
    if (isExcludedFromWbsDecomposition(s)) continue;
    out.push({
      id: s.id,
      name: s.name,
      description: s.description || '',
      parentId: s.parentId,
      level: 'story',
      sourceFrIds: s.sourceFrIds || [],
      sourceUcIds: (s.sourceUcIds || []).filter((uid) => !isCustomerRequirementUcId(uid)),
      // NFR never materializes onto WBS / Gate2 tasks.
      sourceNfrIds: [],
      sourceBgIds: s.sourceBgIds || [],
      sourceCapabilityIds: s.sourceCapabilityIds || [],
      acRefs: Array.isArray(s.acRefs) ? s.acRefs : [],
      // Story / FR value — BA owns clarification; leaves get area→role from WBS LLM.
      suggestedRoleKey: 'business_analyst',
      effortSeedHours: 0,
      effortHours: 0,
      needsDecomposition: s.needsDecomposition !== false,
    });
  }
  return out;
}

function applyBacklogToContainer(container, backlogResult) {
  const next = {
    ...container,
    planning: { ...(container?.planning || {}) },
  };
  next.planning.backlog = backlogResult.backlog;
  // WbsTool owns planning.tasks from approved SRS FR/UC/AC — do not seed from backlog.
  return next;
}

module.exports = {
  runBacklogMapEngine,
  backlogNodesAsTasks,
  applyBacklogToContainer,
  isCustomerRequirementId,
  isCustomerRequirementUcId,
  isExcludedFromWbsDecomposition,
};
