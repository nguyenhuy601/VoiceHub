/**
 * System baseline seed for EffortEstimationConfig — not silent runtime hardcode.
 * Orgs should Publish their own version; APIs surface calculationBasis.source.
 */

const SYSTEM_MEETING_ACTIVITIES = Object.freeze([
  {
    activityId: 'meeting_pm_weekly',
    name: 'Project coordination meetings',
    workType: 'MEETING',
    applicableRoleKeys: ['project_manager'],
    estimationMethod: 'recurring_weekly',
    effortHoursPerUnit: 2,
    unitsPerPeriod: 1,
    enabled: true,
  },
  {
    activityId: 'meeting_ba_weekly',
    name: 'Requirements / stakeholder meetings',
    workType: 'MEETING',
    applicableRoleKeys: ['business_analyst'],
    estimationMethod: 'recurring_weekly',
    effortHoursPerUnit: 3,
    unitsPerPeriod: 1,
    enabled: true,
  },
  {
    activityId: 'meeting_po_weekly',
    name: 'Product alignment meetings',
    workType: 'MEETING',
    applicableRoleKeys: ['product_owner'],
    estimationMethod: 'recurring_weekly',
    effortHoursPerUnit: 1,
    unitsPerPeriod: 1,
    enabled: true,
  },
  {
    activityId: 'meeting_tl_weekly',
    name: 'Technical sync meetings',
    workType: 'MEETING',
    applicableRoleKeys: ['technical_lead'],
    estimationMethod: 'recurring_weekly',
    effortHoursPerUnit: 1,
    unitsPerPeriod: 1,
    enabled: true,
  },
]);

const SYSTEM_CAPACITY_POLICY = Object.freeze({
  hoursPerWeekDefault: 40,
  overloadWarnPct: 100,
  planExceedSuggestChangePct: 20,
  timezone: 'Asia/Ho_Chi_Minh',
});

module.exports = {
  SYSTEM_MEETING_ACTIVITIES,
  SYSTEM_CAPACITY_POLICY,
};
