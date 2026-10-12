/**
 * Pure — weekly MEETING hours by roleKey from activity catalog.
 */
function weeklyMeetingHoursByRole(config) {
  const map = {};
  for (const act of config?.activities || []) {
    if (!act.enabled || act.workType !== 'MEETING') continue;
    if (act.estimationMethod !== 'recurring_weekly') continue;
    const hours = Number(act.effortHoursPerUnit) * Number(act.unitsPerPeriod || 1);
    for (const role of act.applicableRoleKeys || []) {
      map[role] = (map[role] || 0) + hours;
    }
  }
  return map;
}

module.exports = { weeklyMeetingHoursByRole };
