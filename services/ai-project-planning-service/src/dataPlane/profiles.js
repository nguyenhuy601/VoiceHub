/**
 * Task profiles for the shared context compiler.
 * A profile decides which records are required. It does not clip fields.
 */

const PROFILES = Object.freeze({
  WHAT_REQUIREMENT_UNDERSTANDING: Object.freeze({
    phase: 'WHAT',
    taskType: 'what.requirement_understanding',
    defaultBudget: 8000,
    requiredTypes: Object.freeze(['functional_requirement']),
    optionalTypes: Object.freeze(['use_case', 'business_rule']),
  }),
  WHAT_DERIVE_UC: Object.freeze({
    phase: 'WHAT',
    taskType: 'what.derive_uc',
    defaultBudget: 8000,
    requiredTypes: Object.freeze(['functional_requirement', 'business_rule']),
    optionalTypes: Object.freeze(['use_case']),
  }),
  WHAT_DERIVE_NFR: Object.freeze({
    phase: 'WHAT',
    taskType: 'what.derive_nfr',
    defaultBudget: 6000,
    requiredTypes: Object.freeze(['non_functional_requirement']),
    optionalTypes: Object.freeze(['functional_requirement', 'constraint']),
  }),
  HOW_BACKLOG_MAP: Object.freeze({
    phase: 'HOW',
    taskType: 'how.backlog_map',
    defaultBudget: 6000,
    requiredTypes: Object.freeze(['functional_requirement', 'use_case']),
    optionalTypes: Object.freeze([]),
  }),
  WBS_STORY: Object.freeze({
    phase: 'HOW',
    taskType: 'wbs.generate',
    defaultBudget: 6000,
    focusTypes: Object.freeze(['story']),
    expand: Object.freeze(['functional_requirement']),
    fallbackRequiredTypes: Object.freeze(['functional_requirement']),
    optionalTypes: Object.freeze(['use_case', 'constraint']),
  }),
  DEPENDENCY_TASK_SET: Object.freeze({
    phase: 'HOW',
    taskType: 'how.dependency',
    defaultBudget: 6000,
    focusTypes: Object.freeze(['task']),
    expand: Object.freeze(['functional_requirement']),
    optionalTypes: Object.freeze(['functional_requirement', 'use_case', 'business_rule']),
  }),
  ARCHITECTURE_IMPACT: Object.freeze({
    phase: 'HOW',
    taskType: 'how.architecture',
    defaultBudget: 6000,
    focusTypes: Object.freeze(['functional_requirement']),
    expand: Object.freeze(['task']),
    optionalTypes: Object.freeze(['non_functional_requirement', 'constraint']),
  }),
  RISK_ANALYSIS: Object.freeze({
    phase: 'HOW',
    taskType: 'how.risk',
    defaultBudget: 6000,
    requiredTypes: Object.freeze(['constraint']),
    optionalTypes: Object.freeze(['functional_requirement']),
  }),
});

const PROFILE_BY_TASK = Object.freeze(
  Object.fromEntries(Object.entries(PROFILES).map(([name, profile]) => [profile.taskType, name]))
);

function resolveProfile(nameOrTask) {
  const key = String(nameOrTask || '').trim();
  if (PROFILES[key]) return { name: key, ...PROFILES[key] };
  const mapped = PROFILE_BY_TASK[key];
  if (mapped) return { name: mapped, ...PROFILES[mapped] };
  return null;
}

module.exports = {
  PROFILES,
  resolveProfile,
};
