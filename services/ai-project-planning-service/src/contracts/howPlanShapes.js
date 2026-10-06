/**
 * HOW plan additive shapes (Step 0 contract).
 * HARD-01 no silent bypass · HARD-02 single path · HARD-03 real SNAP/pack only.
 *
 * @typedef {'epic'|'feature'|'story'|'task'} WbsLevel
 *
 * @typedef {{
 *   id: string,
 *   name: string,
 *   parentId: string|null,
 *   level: WbsLevel,
 *   featureId?: string|null,
 *   area?: string,
 * }} WbsNode
 *
 * @typedef {{
 *   hoursByComplexity: { low?: number, medium?: number, high?: number },
 *   sampleSize: number,
 * }} HistoryMetrics
 *
 * @typedef {{
 *   frIds: string[],
 *   ucIds: string[],
 *   acSummaries: Array<{ frId: string, index: number, text: string }>,
 *   criticalSkillIds: string[],
 *   domainTokens: string[],
 * }} PlanningHints
 *
 * @typedef {{
 *   userId: string,
 *   fitScore: number,
 *   feasible: boolean,
 *   reasons: string[],
 *   score?: number,
 * }} MatchCandidate
 *
 * @typedef {{
 *   type: string,
 *   taskId?: string,
 *   userId?: string,
 *   dateKey?: string,
 *   detail?: string,
 * }} CapacityConflict
 *
 * @typedef {{
 *   criticalPathDays: number|null,
 *   conflictCount: number,
 *   unassignedCount: number,
 *   criticalFloatRows: Array<{
 *     taskId: string,
 *     name?: string,
 *     totalFloat: number,
 *     start?: string|null,
 *     finish?: string|null,
 *   }>,
 * }} PlanSummary
 */

const HOW_PLAN_SHAPE_VERSION = 'how-plan-shapes-v1';

module.exports = {
  HOW_PLAN_SHAPE_VERSION,
};
