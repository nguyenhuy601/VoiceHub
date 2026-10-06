/**
 * Soft backfill toolData from SNAP payload when start left toolData empty (RULE-HT-04).
 * In-memory only — does not persist PlanningRun.input.
 *
 * HOW ingest one-path:
 * - Employees SoT: toolData → commonFiltered → canonical (never projected)
 * - Booked hours: pickBookedHoursByUserDay (always merge when SNAP has map)
 */

const { pickBookedHoursByUserDay } = require('./pickBookedHoursByUserDay');

/**
 * @param {object|null|undefined} toolData
 * @param {object|null|undefined} snapshot — input.snapshot / snapshotPayload
 * @returns {object}
 */
function hydrateToolDataFromSnapshot(toolData, snapshot) {
  const base =
    toolData && typeof toolData === 'object' && !Array.isArray(toolData)
      ? { ...toolData }
      : {};

  const snap = snapshot && typeof snapshot === 'object' ? snapshot : null;
  const projected = snap?.projected || {};
  const common = snap?.commonFiltered || {};
  const canonical = snap?.canonical || {};

  let employees;
  let employeeSource;
  if (Array.isArray(base.employees)) {
    employees = base.employees;
    employeeSource = 'toolData';
  } else if (Array.isArray(common.employees)) {
    employees = common.employees;
    employeeSource = 'common_filtered';
  } else if (Array.isArray(canonical.employees)) {
    employees = canonical.employees;
    employeeSource = 'canonical';
  } else {
    employees = [];
    employeeSource = 'empty';
  }

  const calendar =
    base.calendar ||
    common.calendar ||
    canonical.calendar ||
    projected.calendar ||
    { workingCalendar: {}, holidays: [] };

  const srsOverview =
    common.overview ||
    canonical.overview ||
    projected.srs?.overview ||
    snap?.overview ||
    {};
  const overview = {
    ...(base.overview && typeof base.overview === 'object' ? base.overview : {}),
    startDate: base.overview?.startDate ?? srsOverview.startDate ?? null,
    deadline: base.overview?.deadline ?? srsOverview.deadline ?? null,
    name: base.overview?.name ?? srsOverview.requirementName ?? srsOverview.name,
  };

  const out = {
    ...base,
    snapshotId:
      base.snapshotId ||
      (snap ? snap.snapshotId || snap._id || snap.id || null : null),
    employees,
    calendar,
    overview,
    staffing:
      base.staffing ||
      common.staffing ||
      canonical.staffing ||
      projected.srs?.staffingPlan ||
      {},
    skillCatalog:
      base.skillCatalog ||
      common.skillCatalog ||
      canonical.skillCatalog ||
      projected.skillCatalog ||
      {},
    merged: base.merged || snap?.merged || common.merged || {},
  };

  const booked = pickBookedHoursByUserDay(base, snap);
  if (booked) {
    out.bookedHoursByUserDay = booked;
    out.meetingHoursByUserDay = booked;
  }

  const didEmployeeBackfill = employeeSource !== 'toolData';
  const hadBookedOnBase = Boolean(base.bookedHoursByUserDay || base.meetingHoursByUserDay);
  const didBookedMerge = Boolean(booked) && !hadBookedOnBase;
  if (didEmployeeBackfill || didBookedMerge) {
    out.filterMeta = {
      ...(base.filterMeta || {}),
      hydrate: didEmployeeBackfill ? 'aps_soft_backfill' : 'aps_booked_merge',
      employeeSource,
      employeeKept: employees.length,
      bookedHoursAttached: Boolean(booked),
    };
  }

  return out;
}

module.exports = {
  hydrateToolDataFromSnapshot,
};
