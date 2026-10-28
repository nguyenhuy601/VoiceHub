/**
 * validateScheduleInputs — tasks required; startDate/calendar optional.
 * Engine resolves project → calendar → today_fallback (scheduleCapacity).
 * Do not block ScheduleTool solely for missing start (that left Gate2 Lịch empty).
 */

function pickStartDate(pack, toolData, input) {
  return (
    toolData?.overview?.startDate ||
    toolData?.calendar?.startDate ||
    input?.overview?.startDate ||
    pack?.overview?.startDate ||
    pack?.calendar?.startDate ||
    null
  );
}

/**
 * @returns {{ ok: true, startDate: string|null, calendar: object|null } | { ok: false, status: 'blocked', blockedBy: string[], error: object }}
 */
function validateScheduleInputs({ pack = {}, toolData = {}, input = {}, container = {} } = {}) {
  const tasks = Array.isArray(container?.planning?.tasks) ? container.planning.tasks : [];
  const leafTasks = tasks.filter((t) => {
    const level = String(t.level || '').toLowerCase();
    return level === 'task' || (!level && t.parentId);
  });
  const blockedBy = [];
  if (!leafTasks.length && !tasks.length) {
    blockedBy.push('tasks');
  }

  const startDate = pickStartDate(pack, toolData, input);

  if (blockedBy.length) {
    return {
      ok: false,
      status: 'blocked',
      blockedBy,
      error: {
        code: 'INPUT_MISSING',
        retryable: false,
        message: `Schedule blocked — missing: ${blockedBy.join(', ')}`,
      },
    };
  }

  return {
    ok: true,
    // String date or null — engine resolves calendar/today fallback.
    startDate: startDate || null,
    calendar: toolData?.calendar || pack?.calendar || (startDate ? { startDate } : null),
  };
}

module.exports = {
  validateScheduleInputs,
  pickStartDate,
};
