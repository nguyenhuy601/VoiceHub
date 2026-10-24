/**
 * Sprint howSec output contract.
 * Timebox stays on the engine window. Feasibility is a label, not a new duration.
 */

const REASON_CODES = Object.freeze([
  'missing_effort',
  'missing_capacity',
  'dependency_unmet',
  'too_early',
  'not_ready',
  'too_large',
  'over_capacity',
  'sprint_timebox_exceeded',
  'unverified_sprint_cpm',
  'dod_work_not_in_sprint',
]);

const FEASIBILITY = Object.freeze([
  'time_slack',
  'time_tight',
  'time_infeasible',
  'unverified',
]);

const LLM_SHAPE = Object.freeze({
  sprints: [{ id: '', goal: '', pbiIds: [] }],
  deferred: [{ pbiId: '', reasonCode: '', reason: '' }],
  conflicts: [{ code: '', sprintId: '', message: '', option: '' }],
  splitProposals: [{ pbiId: '', reason: '' }],
  openQuestions: [],
});

module.exports = {
  REASON_CODES,
  FEASIBILITY,
  LLM_SHAPE,
};
