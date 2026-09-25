/**
 * Soft backfill toolData from SNAP payload when start left toolData empty (RULE-HT-04).
 * In-memory only — does not persist PlanningRun.input.
 */

/**
 * @param {object|null|undefined} toolData
 * @param {object|null|undefined} snapshot — input.snapshot / snapshotPayload (may include projected/commonFiltered)
 * @returns {object}
 */
function hydrateToolDataFromSnapshot(toolData, snapshot) {
  const base =
    toolData && typeof toolData === 'object' && !Array.isArray(toolData)
      ? { ...toolData }
      : {};

  const hasEmployees = Array.isArray(base.employees);
  if (hasEmployees) {
    return base;
  }

  const snap = snapshot && typeof snapshot === 'object' ? snapshot : null;
  if (!snap) {
    return { ...base, employees: Array.isArray(base.employees) ? base.employees : [] };
  }

  const projected = snap.projected || {};
  const common = snap.commonFiltered || {};
  const employees = Array.isArray(common.employees)
    ? common.employees
    : Array.isArray(projected.employees)
      ? projected.employees
      : [];

  const calendar =
    base.calendar ||
    common.calendar ||
    projected.calendar ||
    { workingCalendar: {}, holidays: [] };

  const srsOverview = projected.srs?.overview || snap.overview || {};
  const overview = {
    ...(base.overview && typeof base.overview === 'object' ? base.overview : {}),
    startDate: base.overview?.startDate ?? srsOverview.startDate ?? null,
    deadline: base.overview?.deadline ?? srsOverview.deadline ?? null,
    name: base.overview?.name ?? srsOverview.requirementName ?? srsOverview.name,
  };

  return {
    ...base,
    snapshotId: base.snapshotId || snap.snapshotId || snap._id || snap.id || null,
    employees,
    calendar,
    overview,
    staffing: base.staffing || projected.srs?.staffingPlan || {},
    skillCatalog: base.skillCatalog || projected.skillCatalog || {},
    filterMeta: {
      ...(base.filterMeta || {}),
      hydrate: 'aps_soft_backfill',
      employeeKept: employees.length,
    },
  };
}

module.exports = {
  hydrateToolDataFromSnapshot,
};
