/**
 * Derive Gate2 / Monitor HOW plan summary from real pack.aiAnalysis fields (HARD-03).
 * No invented numbers — missing fields → null/0/empty.
 * Step 8: quality/deploy artifact counts (Quality Gate ≠ Testing Plan).
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

function readSequencingBlock(container) {
  const sequence = container?.planning?.sequence;
  const status = String(sequence?.status || '');
  if (!status.startsWith('BLOCKED')) return null;
  const cycles = Array.isArray(sequence?.graphValidation?.cycles)
    ? sequence.graphValidation.cycles
    : [];
  const reviewCount = cycles.reduce(
    (sum, cycle) => sum + (Array.isArray(cycle?.dependencyIds) ? cycle.dependencyIds.length : 0),
    0
  );
  return { status, cycleCount: cycles.length, reviewCount };
}

function mapQualityDeploySummary(summary) {
  const qp = summary?.qualityPlan && typeof summary.qualityPlan === 'object' ? summary.qualityPlan : null;
  const dp = summary?.deployPlan && typeof summary.deployPlan === 'object' ? summary.deployPlan : null;
  return {
    qualityCatalogCount: qp ? Number(qp.catalogCount) || 0 : null,
    qualityAcCoverageCount: qp ? Number(qp.acCoverageCount) || 0 : null,
    qualityPlanOk: qp ? qp.ok !== false : null,
    deployEnvCount: dp ? Number(dp.envCount) || 0 : null,
    deployPlanOk: dp ? dp.ok !== false : null,
    releaseMode: dp?.releaseMode || null,
    qualityGateNote: summary?.qualityGateNote || null,
  };
}

function countPackScopeObjectives(pack) {
  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) {
    return { scopeInCount: null, scopeOutCount: null, objectiveCount: null, assumptionCount: null };
  }
  const scopes = Array.isArray(pack.scope) ? pack.scope : [];
  let scopeInCount = 0;
  let scopeOutCount = 0;
  for (const s of scopes) {
    const raw = String(s?.type || s?.scopeType || 'in').toLowerCase();
    if (raw === 'out' || raw === 'out_of_scope' || raw === 'oos') scopeOutCount += 1;
    else scopeInCount += 1;
  }
  const objectiveCount = Array.isArray(pack.businessGoals) ? pack.businessGoals.length : 0;
  const assumptionCount = Array.isArray(pack.assumptions) ? pack.assumptions.length : 0;
  const hasPackSheets =
    scopes.length > 0 || objectiveCount > 0 || assumptionCount > 0 || Array.isArray(pack.constraints);
  if (!hasPackSheets) {
    return { scopeInCount: null, scopeOutCount: null, objectiveCount: null, assumptionCount: null };
  }
  return {
    scopeInCount,
    scopeOutCount,
    objectiveCount,
    assumptionCount,
  };
}

/**
 * @param {object|null|undefined} packOrContainer
 */
export function resolveHowPlanSummary(packOrContainer) {
  const pack =
    packOrContainer?.aiAnalysis && typeof packOrContainer.aiAnalysis === 'object'
      ? packOrContainer
      : null;
  const container =
    packOrContainer?.aiAnalysis && typeof packOrContainer.aiAnalysis === 'object'
      ? packOrContainer.aiAnalysis
      : packOrContainer && typeof packOrContainer === 'object'
        ? packOrContainer
        : {};
  const packCounts = countPackScopeObjectives(pack || packOrContainer);
  const sequencingBlocked = readSequencingBlock(container);

  const summary =
    container.planning?.planSummary && typeof container.planning.planSummary === 'object'
      ? container.planning.planSummary
      : null;

  if (summary) {
    const rows = Array.isArray(summary.criticalFloatRows) ? summary.criticalFloatRows : [];
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
    const qd = mapQualityDeploySummary(summary);
    return {
      criticalPathDays:
        summary.criticalPathDays == null || summary.criticalPathDays === ''
          ? null
          : Number(summary.criticalPathDays),
      conflictCount: Number(summary.conflictCount) || 0,
      unassignedCount: Number(summary.unassignedCount) || 0,
      criticalFloatRows: rows.slice(0, 20),
      deadlineConflict,
      ...qd,
      ...packCounts,
      sequencingBlocked,
      hasSummary: true,
    };
  }

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
  const qp = container.planning?.qualityPlan;
  const dp = container.planning?.deployPlan;
  const qualityCatalogCount = Array.isArray(qp?.catalogPlan) ? qp.catalogPlan.length : null;
  const qualityAcCoverageCount = Array.isArray(qp?.acCoverage) ? qp.acCoverage.length : null;
  const deployEnvCount = Array.isArray(dp?.envMatrix) ? dp.envMatrix.length : null;

  const hasAny =
    conflicts.length > 0 ||
    unassigned.length > 0 ||
    cpmTasks.length > 0 ||
    Boolean(container.planning?.completion?.estimatedEnd) ||
    Boolean(deadlineConflict) ||
    Boolean(qp) ||
    Boolean(dp);

  const hasPackContext =
    packCounts.scopeInCount != null ||
    packCounts.objectiveCount != null ||
    packCounts.assumptionCount != null;

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
    qualityCatalogCount,
    qualityAcCoverageCount,
    qualityPlanOk: qp ? true : null,
    deployEnvCount,
    deployPlanOk: dp ? true : null,
    releaseMode: dp?.releaseStrategy?.mode || null,
    qualityGateNote:
      'Quality Gate = approve/baseline; Testing/Deploy Plans are artifacts',
    ...packCounts,
    sequencingBlocked,
    hasSummary: hasAny || hasPackContext || Boolean(sequencingBlocked),
  };
}

export default resolveHowPlanSummary;
