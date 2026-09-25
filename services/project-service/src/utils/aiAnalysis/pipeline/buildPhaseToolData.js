/**
 * Build S2S toolData for phase_what / phase_how from frozen SNAP (RULE-HT-01).
 * No live org fetch — reuse buildJobInputFromSnapshot + splitContext SoT.
 */

const { buildJobInputFromSnapshot } = require('./buildPipeline');
const { fingerprint } = require('./splitContext');

/**
 * @param {object|null} snapshot — AiAnalysisSnapshot lean/toObject
 * @param {string} phaseJob — phase_how | phase_what | how | what
 * @returns {object} toolData (may be {})
 */
function buildPhaseToolData(snapshot, phaseJob) {
  const phase = String(phaseJob || '')
    .trim()
    .toLowerCase()
    .replace(/^phase_/, '');

  if (phase !== 'how') {
    return {};
  }

  if (!snapshot || typeof snapshot !== 'object') {
    return {
      snapshotId: null,
      employees: [],
      calendar: { workingCalendar: {}, holidays: [] },
      overview: {},
      filterMeta: { hydrate: 'no_snapshot' },
    };
  }

  const snapshotId = String(snapshot._id || snapshot.id || snapshot.snapshotId || '').trim() || null;

  const matching = buildJobInputFromSnapshot(snapshot, 'employeeMatching');
  const sched = buildJobInputFromSnapshot(snapshot, 'scheduleCapacity');

  const matchingTool = matching.toolData || {};
  const schedTool = sched.toolData || {};

  const employees = Array.isArray(matchingTool.employees)
    ? matchingTool.employees
    : Array.isArray(schedTool.employees)
      ? schedTool.employees
      : [];

  const calendar =
    schedTool.calendar ||
    matchingTool.calendar ||
    snapshot.commonFiltered?.calendar ||
    snapshot.projected?.calendar ||
    { workingCalendar: {}, holidays: [] };

  const overview = {
    startDate:
      schedTool.overview?.startDate ||
      matchingTool.overview?.startDate ||
      snapshot.projected?.srs?.overview?.startDate ||
      null,
    deadline:
      schedTool.overview?.deadline ||
      matchingTool.overview?.deadline ||
      snapshot.projected?.srs?.overview?.deadline ||
      null,
    name:
      schedTool.overview?.name ||
      matchingTool.overview?.name ||
      snapshot.projected?.srs?.overview?.requirementName ||
      undefined,
  };

  const toolData = {
    snapshotId,
    employees,
    staffing: matchingTool.staffing || schedTool.staffing || {},
    requirementSkills: matchingTool.requirementSkills || [],
    merged: matchingTool.merged || schedTool.merged || {},
    calendar,
    overview,
    skillCatalog: matchingTool.skillCatalog || {},
    filterMeta: {
      ...(matchingTool.filterMeta || {}),
      hydrate: 'phase_how',
      matchingEmployeeKept: employees.length,
      scheduleCalendar: Boolean(calendar && (calendar.holidays || calendar.workingCalendar)),
    },
  };

  // Optional passthrough — never invent
  if (
    snapshot.meetingHoursByUserDay &&
    typeof snapshot.meetingHoursByUserDay === 'object' &&
    !Array.isArray(snapshot.meetingHoursByUserDay)
  ) {
    toolData.meetingHoursByUserDay = snapshot.meetingHoursByUserDay;
  }

  toolData.inputFingerprint = fingerprint({
    snapshotId,
    job: 'phase_how',
    tool: {
      employeeIds: employees.map((e) => e.userId || e.employeeId).filter(Boolean),
      calendar,
      overview,
    },
  });

  return toolData;
}

module.exports = {
  buildPhaseToolData,
};
