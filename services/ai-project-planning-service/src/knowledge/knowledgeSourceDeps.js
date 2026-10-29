/**
 * sourceManifest / normalizeCatalog / canonicalSrs dependency contracts for knowledgeCatalog+RAG Knowledge layer.
 * Mirrors project-service sourceManifest field lists (do not dump full DB docs).
 * SoT narrative: .cursor/plans/ai-project-g1-g7-build-contracts.md
 */

const KNOWLEDGE_SOURCE_DEPS_VERSION = 'g1.deps.v1';

/** sourceManifest source ids — System Supplement + SRS pack. */
const KNOWLEDGE_SOURCE_IDS = Object.freeze([
  'srs_pack',
  'employee_pool',
  'skill_catalog',
  'org_calendar',
  'project_history',
]);

/**
 * Field whitelist (aligned with project-service sourceManifest + history slice).
 * sourceManifest AC: mỗi run ghi loại nguồn; không lẫn supplement/SRS không version.
 */
const KNOWLEDGE_SOURCE_FIELD_MANIFEST = Object.freeze({
  srs_pack: Object.freeze([
    'overview',
    'functionalRequirements',
    'nonFunctionalRequirements',
    'staffingPlan',
    'requirementSkills',
    'technology',
    'versionNumber',
    'templateVersion',
  ]),
  employee_pool: Object.freeze([
    'userId',
    'employeeId',
    'jobTitle',
    'membershipRole',
    'availability',
    'allocatedPct',
    'availablePct',
    'capacityRange',
    'skills',
    'capability',
    'performance',
    'isActive',
    'employeeCode',
    'projectCount',
    'resourceConfig',
    'maxConcurrentProjects',
    'history',
  ]),
  skill_catalog: Object.freeze(['version', 'skills']),
  org_calendar: Object.freeze(['workingCalendar', 'holidays']),
  /**
   * View on verified UserProfile.projectExperiences (not a separate DB load).
   * Origins: cv_parse (personal CV) | closed_board (project/board close) | excel_import | manual.
   * SNAP also pins derived bookedHoursByUserDay (allocation × calendar) — not a sourceManifest source id.
   */
  project_history: Object.freeze([
    'role',
    'domain',
    'months',
    'projectName',
    'work',
    'source',
    'year',
  ]),
});

/**
 * normalizeCatalog catalog-miss policy defaults.
 * skill unknown → error (blocks normalize); metric unknown → error for tool evidence;
 * dimension alias miss → warn then passthrough raw.
 */
const G3_CATALOG_MISS_POLICY = Object.freeze({
  skill: 'error',
  metric: 'error',
  dimension: 'warn',
});

/**
 * canonicalSrs canonical SRS — corpus input for RAG after Gate 1.
 * HOW/tools fail if missing approved version (Build Spec canonicalSrs AC).
 */
const G6_CANONICAL_REQUIRED_FIELDS = Object.freeze([
  'approvedSrsVersion',
  'status',
  'functionalRequirements',
  'nonFunctionalRequirements',
]);

/**
 * RULE-09: every PlanningRun / Context Package retrieval binds snapshotId.
 * @param {{ snapshotId?: string, runId?: string }} bind
 */
function assertSnapshotBind(bind = {}) {
  const snapshotId = String(bind.snapshotId || '').trim();
  if (!snapshotId) {
    const err = new Error('snapshotId required (RULE-09)');
    err.code = 'SNAPSHOT_BIND_REQUIRED';
    throw err;
  }
  return {
    snapshotId,
    runId: bind.runId != null ? String(bind.runId) : undefined,
  };
}

/**
 * @param {string} sourceId
 * @returns {readonly string[]|null}
 */
function fieldsForSource(sourceId) {
  const key = String(sourceId || '').trim();
  return KNOWLEDGE_SOURCE_FIELD_MANIFEST[key] || null;
}

/**
 * @param {unknown} canonical
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateG6CanonicalEnvelope(canonical) {
  const errors = [];
  if (!canonical || typeof canonical !== 'object') {
    return { ok: false, errors: ['canonical SRS required'] };
  }
  for (const f of G6_CANONICAL_REQUIRED_FIELDS) {
    if (canonical[f] == null || canonical[f] === '') {
      errors.push(`${f} required`);
    }
  }
  if (canonical.status != null && String(canonical.status) !== 'approved') {
    errors.push('status must be approved for RAG Phase-2 corpus');
  }
  return { ok: errors.length === 0, errors };
}

module.exports = {
  KNOWLEDGE_SOURCE_DEPS_VERSION,
  KNOWLEDGE_SOURCE_IDS,
  KNOWLEDGE_SOURCE_FIELD_MANIFEST,
  G3_CATALOG_MISS_POLICY,
  G6_CANONICAL_REQUIRED_FIELDS,
  assertSnapshotBind,
  fieldsForSource,
  validateG6CanonicalEnvelope,
};
