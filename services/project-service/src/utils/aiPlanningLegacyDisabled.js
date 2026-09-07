/**

 * Legacy AI Planning disable helper — product re-enabled Planning; keep codes for clients

 * that still map AI_PLANNING_LEGACY_DISABLED but assert no longer blocks.

 */



const AI_PLANNING_LEGACY_DISABLED_CODE = 'AI_PLANNING_LEGACY_DISABLED';

const AI_PLANNING_LEGACY_DISABLED_STATUS = 410;

const AI_PLANNING_LEGACY_DISABLED_MESSAGE =

  'Legacy AI Planning tạm dừng — dùng AI Analysis jobs (W2+)';



/** No-op: AI Planning (staffing/assign) is enabled again. */

function assertAiPlanningLegacyDisabled() {

  // intentionally empty

}



module.exports = {

  assertAiPlanningLegacyDisabled,

  AI_PLANNING_LEGACY_DISABLED_CODE,

  AI_PLANNING_LEGACY_DISABLED_STATUS,

  AI_PLANNING_LEGACY_DISABLED_MESSAGE,

};


