/**
 * Sprint howSec — LLM proposes Story→Sprint; tool validates.
 */

const REASON_CODES = Object.freeze([
  'missing_effort',
  'missing_capacity',
  'dependency_unmet',
  'dependency_order',
  'too_early',
  'not_ready',
  'too_large',
  'over_capacity',
  'over_capacity_role',
  'sprint_timebox_exceeded',
  'unverified_sprint_cpm',
  'dod_work_not_in_sprint',
  'pbi_not_in_allow',
  'sprint_id_not_in_allow',
  'duplicate_pbi',
  'duplicate_task',
  'effort_mismatch',
  'story_incomplete_time',
  'insufficient_capacity_evidence',
  'insufficient_dependency_evidence',
]);

const FEASIBILITY = Object.freeze([
  'time_slack',
  'time_tight',
  'time_infeasible',
  'unverified',
]);

const EXECUTION_STATUS = Object.freeze({
  BLOCKED: 'blocked',
  INCOMPLETE: 'incomplete',
  DRAFT_READY: 'draft_ready',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
});

const VALIDATION_STATUS = Object.freeze({
  VALIDATED: 'validated',
  INVALID: 'invalid',
  INSUFFICIENT_DATA: 'insufficient_data',
});

const GOAL_SOURCE = Object.freeze({
  LLM: 'llm',
  HUMAN: 'human',
  NONE: 'none',
});

/** LLM proposes allocation + goal + rationale — no effort/capacity invent. */
const LLM_SHAPE = Object.freeze({
  sprints: [{ id: '', goal: '', rationale: '', pbiIds: [] }],
  deferred: [{ pbiId: '', reasonCode: '', reason: '' }],
  openQuestions: [],
});

module.exports = {
  REASON_CODES,
  FEASIBILITY,
  EXECUTION_STATUS,
  VALIDATION_STATUS,
  GOAL_SOURCE,
  LLM_SHAPE,
};
