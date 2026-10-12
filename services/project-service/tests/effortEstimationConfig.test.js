/**
 * EffortEstimationConfig helpers — weekly hours by role from activities.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  SYSTEM_MEETING_ACTIVITIES,
  SYSTEM_CAPACITY_POLICY,
} = require('../src/constants/effortEstimationDefaults');
const { weeklyMeetingHoursByRole } = require('../src/utils/effort/weeklyMeetingHoursByRole');

describe('effortEstimationConfig helpers', () => {
  it('sums recurring MEETING hours by role from system baseline', () => {
    const map = weeklyMeetingHoursByRole({
      activities: SYSTEM_MEETING_ACTIVITIES,
    });
    assert.equal(map.project_manager, 2);
    assert.equal(map.business_analyst, 3);
    assert.equal(map.product_owner, 1);
    assert.equal(map.technical_lead, 1);
  });

  it('ignores disabled or non-meeting activities', () => {
    const map = weeklyMeetingHoursByRole({
      activities: [
        {
          workType: 'MEETING',
          enabled: false,
          estimationMethod: 'recurring_weekly',
          effortHoursPerUnit: 9,
          unitsPerPeriod: 1,
          applicableRoleKeys: ['project_manager'],
        },
        {
          workType: 'DELIVERY',
          enabled: true,
          estimationMethod: 'recurring_weekly',
          effortHoursPerUnit: 5,
          unitsPerPeriod: 1,
          applicableRoleKeys: ['project_manager'],
        },
      ],
    });
    assert.equal(map.project_manager, undefined);
  });

  it('exposes system capacity policy defaults', () => {
    assert.equal(SYSTEM_CAPACITY_POLICY.hoursPerWeekDefault, 40);
    assert.equal(SYSTEM_CAPACITY_POLICY.planExceedSuggestChangePct, 20);
    assert.equal(SYSTEM_CAPACITY_POLICY.timezone, 'Asia/Ho_Chi_Minh');
  });
});
