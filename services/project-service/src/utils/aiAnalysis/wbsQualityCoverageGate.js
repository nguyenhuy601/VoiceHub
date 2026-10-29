/**
 * Gate2 approve — WBS AC coverage + Quality coverage (mirror APS validation helpers).
 * Pure; no Mongo. Soft-skip legacy packs without coverage stamps.
 */

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function containerFromPack(packOrContainer) {
  if (!packOrContainer || typeof packOrContainer !== 'object') return {};
  if (packOrContainer.aiAnalysis && typeof packOrContainer.aiAnalysis === 'object') {
    return packOrContainer.aiAnalysis;
  }
  return packOrContainer;
}

function evaluateWbsCoverage(meta = {}, opts = {}) {
  const uncoveredAcKeys = asArray(meta.uncoveredAcKeys);
  const uncoveredFrIds = asArray(meta.uncoveredFrIds);
  const unresolved = [
    ...asArray(meta.unresolvedStoryIds),
    ...asArray(meta.unresolvedUnitIds),
  ];
  const tasks = asArray(opts.tasks);
  const leafCount =
    meta.leafCount != null
      ? Number(meta.leafCount)
      : meta.taskCount != null
        ? Number(meta.taskCount)
        : tasks.length;

  const generationSucceeded = leafCount > 0;
  const explicitComplete = meta.coverageComplete;
  const coverageComplete =
    explicitComplete === true
      ? true
      : explicitComplete === false
        ? false
        : uncoveredAcKeys.length === 0 &&
          uncoveredFrIds.length === 0 &&
          unresolved.length === 0 &&
          generationSucceeded;

  const failures = [];
  if (!coverageComplete && (generationSucceeded || uncoveredAcKeys.length || unresolved.length)) {
    failures.push({
      code: 'AC_COVERAGE_GAP',
      message:
        'WBS AC/FR coverage incomplete — còn AC/Story bắt buộc chưa được Task bao phủ; không duyệt phạm vi này',
      detail: {
        uncoveredAcKeys: uncoveredAcKeys.slice(0, 40),
        uncoveredFrIds: uncoveredFrIds.slice(0, 40),
        unresolvedStoryIds: unresolved.slice(0, 40),
        leafCount,
        generationSucceeded,
        coverageComplete: false,
      },
    });
  }

  return {
    generationSucceeded,
    coverageComplete: Boolean(coverageComplete),
    failures,
  };
}

function evaluateWbsCoverageFromContainer(container = {}) {
  const planning =
    container.planning && typeof container.planning === 'object' ? container.planning : {};
  const meta =
    planning.wbs?.meta && typeof planning.wbs.meta === 'object' ? planning.wbs.meta : {};
  const hasCoverageFields =
    meta.coverageComplete === true ||
    meta.coverageComplete === false ||
    asArray(meta.uncoveredAcKeys).length > 0 ||
    asArray(meta.uncoveredFrIds).length > 0 ||
    asArray(meta.unresolvedStoryIds).length > 0 ||
    asArray(meta.unresolvedUnitIds).length > 0;

  if (!hasCoverageFields) {
    return { enforce: false, legacySoftSkip: true, coverageComplete: true, failures: [] };
  }
  const evaluated = evaluateWbsCoverage(meta, { tasks: planning.tasks });
  return { enforce: true, legacySoftSkip: false, ...evaluated };
}

/**
 * Quality plan coverage — ac||catalog > 0 is NOT sufficient.
 * Uses qualityPlan.meta.coverageComplete when stamped; else derives from uncoveredCriteria.
 */
function evaluateQualityCoverageFromContainer(container = {}) {
  const planning =
    container.planning && typeof container.planning === 'object' ? container.planning : {};
  const qp = planning.qualityPlan && typeof planning.qualityPlan === 'object' ? planning.qualityPlan : null;
  if (!qp) {
    return { enforce: false, legacySoftSkip: true, coverageComplete: true, failures: [] };
  }

  const meta = qp.meta && typeof qp.meta === 'object' ? qp.meta : {};
  const hasStamp =
    meta.coverageComplete === true ||
    meta.coverageComplete === false ||
    asArray(meta.uncoveredCriteria).length > 0 ||
    asArray(meta.reasonCodes).length > 0;

  if (!hasStamp) {
    // Legacy structural-only plans — leave to qualityDeployPlanGate era soft rules.
    return { enforce: false, legacySoftSkip: true, coverageComplete: true, failures: [] };
  }

  const coverageComplete = meta.coverageComplete === true;
  const failures = [];
  if (!coverageComplete) {
    const codes = asArray(meta.reasonCodes);
    const code = codes.includes('TEST_DETAILS_INCOMPLETE')
      ? 'TEST_DETAILS_INCOMPLETE'
      : codes.includes('MISSING_REQUIRED_UC_REF')
        ? 'MISSING_REQUIRED_UC_REF'
        : codes.includes('INVALID_SOURCE_REF')
          ? 'INVALID_SOURCE_REF'
          : 'AC_COVERAGE_GAP';
    failures.push({
      code,
      message:
        'Quality/testing coverage incomplete — còn tiêu chí bắt buộc chưa có TC thực thi được',
      detail: {
        uncoveredCriteria: asArray(meta.uncoveredCriteria).slice(0, 40),
        reasonCodes: codes,
        coverageComplete: false,
      },
    });
  }

  return {
    enforce: true,
    legacySoftSkip: false,
    coverageComplete,
    failures,
  };
}

/**
 * Merge WBS + Quality coverage failures into feasibility-shaped object.
 */
function mergeWbsQualityCoverageIntoFeasibility(feasibility, packOrContainer) {
  const container = containerFromPack(packOrContainer);
  const wbs = evaluateWbsCoverageFromContainer(container);
  const quality = evaluateQualityCoverageFromContainer(container);
  const extra = [...(wbs.failures || []), ...(quality.failures || [])];
  if (!extra.length) {
    return {
      feasibility: feasibility
        ? {
            ...feasibility,
            wbsCoverageOk: wbs.coverageComplete !== false,
            qualityCoverageOk: quality.coverageComplete !== false,
          }
        : feasibility,
      wbs,
      quality,
    };
  }

  const base = feasibility && typeof feasibility === 'object'
    ? { ...feasibility }
    : { pass: true, failures: [], source: 'wbs_quality_coverage', evidenceRefs: [] };
  const failures = [...asArray(base.failures)];
  for (const f of extra) {
    if (!failures.some((x) => String(x?.code) === String(f.code) && String(x?.message) === String(f.message))) {
      failures.push(f);
    }
  }
  return {
    feasibility: {
      ...base,
      pass: false,
      failures,
      wbsCoverageOk: wbs.coverageComplete !== false,
      qualityCoverageOk: quality.coverageComplete !== false,
      source: base.source || 'wbs_quality_coverage',
    },
    wbs,
    quality,
  };
}

module.exports = {
  evaluateWbsCoverage,
  evaluateWbsCoverageFromContainer,
  evaluateQualityCoverageFromContainer,
  mergeWbsQualityCoverageIntoFeasibility,
};
