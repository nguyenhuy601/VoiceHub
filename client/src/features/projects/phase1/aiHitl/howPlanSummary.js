/**

 * Derive Gate2 / Monitor HOW plan summary from real pack.aiAnalysis fields (HARD-03).

 * No invented numbers — missing fields → null/0/empty.

 */



function toDateKey(v) {

  if (v == null || v === '') return null;

  const s = String(v);

  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);

  return m ? m[1] : null;

}



function resolveDeadlineConflictFromConflicts(conflicts) {

  const past = (Array.isArray(conflicts) ? conflicts : []).find(

    (c) => String(c?.type || '') === 'past_deadline'

  );

  if (!past) return null;

  const deadline = toDateKey(past.deadline);

  const estimatedEnd = toDateKey(past.estimatedEnd);

  let daysOver = null;

  if (deadline && estimatedEnd) {

    const d0 = new Date(`${deadline}T12:00:00.000Z`);

    const d1 = new Date(`${estimatedEnd}T12:00:00.000Z`);

    daysOver = Math.max(0, Math.round((d1 - d0) / 86400000));

  }

  return {

    deadline,

    estimatedEnd,

    daysOver,

    needsPmReview: true,

  };

}



/**

 * @param {object|null|undefined} packOrContainer

 * @returns {{

 *   criticalPathDays: number|null,

 *   conflictCount: number,

 *   unassignedCount: number,

 *   criticalFloatRows: Array<object>,

 *   deadlineConflict: object|null,

 *   hasSummary: boolean,

 * }}

 */

export function resolveHowPlanSummary(packOrContainer) {

  const container =

    packOrContainer?.aiAnalysis && typeof packOrContainer.aiAnalysis === 'object'

      ? packOrContainer.aiAnalysis

      : packOrContainer && typeof packOrContainer === 'object'

        ? packOrContainer

        : {};



  const summary =

    container.planning?.planSummary && typeof container.planning.planSummary === 'object'

      ? container.planning.planSummary

      : null;



  if (summary) {

    const rows = Array.isArray(summary.criticalFloatRows)

      ? summary.criticalFloatRows

      : [];

    const deadlineConflict =

      summary.deadlineConflict && typeof summary.deadlineConflict === 'object'

        ? {

            deadline: toDateKey(summary.deadlineConflict.deadline),

            estimatedEnd: toDateKey(summary.deadlineConflict.estimatedEnd),

            daysOver:

              summary.deadlineConflict.daysOver == null

                ? null

                : Number(summary.deadlineConflict.daysOver),

            needsPmReview: summary.deadlineConflict.needsPmReview !== false,

          }

        : null;

    return {

      criticalPathDays:

        summary.criticalPathDays == null || summary.criticalPathDays === ''

          ? null

          : Number(summary.criticalPathDays),

      conflictCount: Number(summary.conflictCount) || 0,

      unassignedCount: Number(summary.unassignedCount) || 0,

      criticalFloatRows: rows.slice(0, 20),

      deadlineConflict,

      hasSummary: true,

    };

  }



  // Fallback from raw resource/planning (still real fields only)

  const conflicts = Array.isArray(container.resource?.capacityConflicts)

    ? container.resource.capacityConflicts

    : [];

  const unassigned = Array.isArray(container.resource?.matching?.unassigned)

    ? container.resource.matching.unassigned

    : Array.isArray(container.resource?.unassigned)

      ? container.resource.unassigned

      : [];

  const cpmTasks = Array.isArray(container.planning?.theoreticalCpm?.tasks)

    ? container.planning.theoreticalCpm.tasks.filter((t) => t?.critical)

    : [];



  const deadlineConflict = resolveDeadlineConflictFromConflicts(conflicts);



  const hasAny =

    conflicts.length > 0 ||

    unassigned.length > 0 ||

    cpmTasks.length > 0 ||

    Boolean(container.planning?.completion?.estimatedEnd) ||

    Boolean(deadlineConflict);



  return {

    criticalPathDays: null,

    conflictCount: conflicts.length,

    unassignedCount: unassigned.length,

    criticalFloatRows: cpmTasks.slice(0, 20).map((t) => ({

      taskId: t.id || t.taskId,

      name: t.name || t.id || t.taskId,

      totalFloat: Number(t.totalFloat) || 0,

      start: null,

      finish: null,

    })),

    deadlineConflict,

    hasSummary: hasAny,

  };

}



export default resolveHowPlanSummary;


