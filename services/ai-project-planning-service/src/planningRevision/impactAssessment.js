/**
 * Server-side impact policy for HOW human edits (RULE-WBS-03 / RULE-REV).
 * LLM may suggest classification — never decide to skip checks alone.
 *
 * policyVersion bumps when matrix semantics change.
 */

const { newImpactId } = require('./revisionIds');

const POLICY_VERSION = 'how-impact-v1';

/** @typedef {'unchanged'|'recalc'|'regen'|'human_confirm'|'stale'} ImpactAction */

const SEMANTIC_FIELDS = Object.freeze([
  'description',
  'acceptanceCriteria',
  'ac',
  'scope',
  'title',
  'name',
]);

const EFFORT_FIELDS = Object.freeze([
  'estimateHours',
  'effortHours',
  'hours',
  'hoursPerDay',
  'durationDays',
]);

const STRUCTURE_ACTIONS = Object.freeze([
  'add_task',
  'remove_task',
  'split_task',
  'merge_task',
  'reparent',
]);

/**
 * Classify a single field change. Conservative default → human_confirm / stale.
 * @param {{ field?: string, before?: unknown, after?: unknown, changeType?: string, noSemanticChange?: boolean }} change
 * @returns {{ artifacts: Record<string, ImpactAction>, notes: string[] }}
 */
function classifyFieldChange(change = {}) {
  const field = String(change.field || '').trim();
  const changeType = String(change.changeType || '').trim().toLowerCase();
  const notes = [];
  /** @type {Record<string, ImpactAction>} */
  const artifacts = {
    wbs: 'unchanged',
    dependency: 'unchanged',
    risk: 'unchanged',
    quality: 'unchanged',
    schedule: 'unchanged',
    feasibility: 'unchanged',
  };

  if (STRUCTURE_ACTIONS.includes(changeType)) {
    artifacts.wbs = 'regen';
    artifacts.dependency = 'regen';
    artifacts.risk = 'stale';
    artifacts.quality = 'stale';
    artifacts.schedule = 'regen';
    artifacts.feasibility = 'recalc';
    notes.push(`structure:${changeType}`);
    return { artifacts, notes };
  }

  if (changeType === 'dependency_edge' || field === 'dependencies' || field === 'dependsOn') {
    artifacts.dependency = 'recalc';
    artifacts.schedule = 'recalc';
    artifacts.feasibility = 'recalc';
    notes.push('dependency_edges');
    return { artifacts, notes };
  }

  if (field === 'assignee' || field === 'assigneeId' || field === 'timeWindow' || field === 'sprintId') {
    artifacts.schedule = 'recalc';
    artifacts.feasibility = 'recalc';
    // Capacity / skill fit may invalidate matching — mark stale for human_confirm if needed
    artifacts.risk = 'human_confirm';
    notes.push('assignee_or_window');
    return { artifacts, notes };
  }

  if (EFFORT_FIELDS.includes(field)) {
    artifacts.schedule = 'recalc';
    artifacts.feasibility = 'recalc';
    notes.push('effort');
    return { artifacts, notes };
  }

  // Cosmetic path: only when human explicitly asserts no semantic change AND field is title-like typo
  if (change.noSemanticChange === true) {
    const before = String(change.before ?? '');
    const after = String(change.after ?? '');
    if (before === after) {
      notes.push('noop');
      return { artifacts, notes };
    }
    artifacts.wbs = 'unchanged';
    notes.push('human_no_semantic_change');
    return { artifacts, notes };
  }

  if (SEMANTIC_FIELDS.includes(field) || !field) {
    // Same entityId + content meaning change → dependents are stale candidates
    artifacts.wbs = 'human_confirm';
    artifacts.dependency = 'stale';
    artifacts.risk = 'stale';
    artifacts.quality = 'stale';
    artifacts.schedule = 'human_confirm';
    artifacts.feasibility = 'human_confirm';
    notes.push(`semantic_field:${field || 'unknown'}`);
    return { artifacts, notes };
  }

  // Unknown field — conservative
  artifacts.dependency = 'human_confirm';
  artifacts.risk = 'human_confirm';
  artifacts.quality = 'human_confirm';
  artifacts.schedule = 'human_confirm';
  notes.push(`unknown_field:${field}`);
  return { artifacts, notes };
}

function mergeAction(a, b) {
  const rank = {
    unchanged: 0,
    recalc: 1,
    human_confirm: 2,
    stale: 3,
    regen: 4,
  };
  return (rank[b] || 0) >= (rank[a] || 0) ? b : a;
}

/**
 * @param {{
 *   changes?: Array<object>,
 *   llmHint?: { cosmetic?: boolean }|null,
 *   policyVersion?: string,
 * }} input
 */
function assessHumanEditImpact(input = {}) {
  const changes = Array.isArray(input.changes) ? input.changes : [];
  /** @type {Record<string, ImpactAction>} */
  const merged = {
    wbs: 'unchanged',
    dependency: 'unchanged',
    risk: 'unchanged',
    quality: 'unchanged',
    schedule: 'unchanged',
    feasibility: 'unchanged',
  };
  const notes = [];

  // LLM hint alone never skips — only recorded
  if (input.llmHint?.cosmetic === true) {
    notes.push('llm_hint_cosmetic_ignored_as_authority');
  }

  if (!changes.length) {
    // Empty change set with no explicit no-op → require human confirm on dependents
    merged.dependency = 'human_confirm';
    merged.risk = 'human_confirm';
    merged.quality = 'human_confirm';
    notes.push('empty_changes_conservative');
  }

  for (const ch of changes) {
    const part = classifyFieldChange(ch);
    for (const [k, v] of Object.entries(part.artifacts)) {
      merged[k] = mergeAction(merged[k], v);
    }
    notes.push(...part.notes);
  }

  const needsRecheck = Object.entries(merged)
    .filter(([, action]) => action !== 'unchanged')
    .map(([artifact, action]) => ({ artifact, action }));

  return Object.freeze({
    impactAssessmentId: input.impactAssessmentId || newImpactId(),
    policyVersion: input.policyVersion || POLICY_VERSION,
    artifacts: Object.freeze({ ...merged }),
    needsRecheck,
    notes: Object.freeze([...notes]),
    assessedAt: new Date().toISOString(),
  });
}

/**
 * Mark container analyses/sections stale per impact (does not delete history).
 * @param {object} container
 * @param {object} assessment
 */
function applyImpactStaleFlags(container, assessment) {
  const base = container && typeof container === 'object' ? { ...container } : {};
  const planning = { ...(base.planning || {}) };
  const stale = { ...(planning.artifactStale || {}) };
  const artifacts = assessment?.artifacts || {};
  for (const [kind, action] of Object.entries(artifacts)) {
    if (action === 'unchanged') continue;
    stale[kind] = {
      action,
      impactAssessmentId: assessment.impactAssessmentId,
      at: assessment.assessedAt,
    };
  }
  planning.artifactStale = stale;
  base.planning = planning;
  return base;
}

module.exports = {
  POLICY_VERSION,
  SEMANTIC_FIELDS,
  EFFORT_FIELDS,
  STRUCTURE_ACTIONS,
  classifyFieldChange,
  assessHumanEditImpact,
  applyImpactStaleFlags,
};
