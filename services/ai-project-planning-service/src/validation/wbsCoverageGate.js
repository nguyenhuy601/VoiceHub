/**
 * WBS AC coverage gate — generationSucceeded ≠ coverageComplete ≠ approvable.
 * Structural cite coverage only (RULE-03); semantic implement AC is soft/HITL.
 */

const CODE_AC_COVERAGE_GAP = 'AC_COVERAGE_GAP';
const CODE_MISSING_AC = 'MISSING_ACCEPTANCE_CRITERIA';

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function readWbsMeta(containerOrPlanning = {}) {
  const planning =
    containerOrPlanning?.planning && typeof containerOrPlanning.planning === 'object'
      ? containerOrPlanning.planning
      : containerOrPlanning && typeof containerOrPlanning === 'object'
        ? containerOrPlanning
        : {};
  const wbs = planning.wbs && typeof planning.wbs === 'object' ? planning.wbs : {};
  return wbs.meta && typeof wbs.meta === 'object' ? wbs.meta : {};
}

/**
 * @param {{
 *   uncoveredAcKeys?: string[],
 *   uncoveredFrIds?: string[],
 *   unresolvedStoryIds?: string[],
 *   unresolvedUnitIds?: string[],
 *   leafCount?: number,
 *   taskCount?: number,
 *   coverageComplete?: boolean|null,
 *   reasonCodes?: string[],
 * }} meta
 * @param {{ tasks?: object[] }} [opts]
 */
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
        : tasks.filter((t) => {
            const level = String(t?.level || t?.wbsLevel || '').toLowerCase();
            return !level || level === 'task' || level === 'leaf';
          }).length;

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

  const reasonCodes = [];
  if (asArray(meta.reasonCodes).includes(CODE_MISSING_AC)) {
    reasonCodes.push(CODE_MISSING_AC);
  }
  if (uncoveredAcKeys.length || uncoveredFrIds.length || unresolved.length) {
    reasonCodes.push(CODE_AC_COVERAGE_GAP);
  }
  if (explicitComplete === false && !reasonCodes.includes(CODE_AC_COVERAGE_GAP)) {
    reasonCodes.push(CODE_AC_COVERAGE_GAP);
  }

  const failures = [];
  if (!coverageComplete && (generationSucceeded || uncoveredAcKeys.length || unresolved.length)) {
    failures.push({
      code: CODE_AC_COVERAGE_GAP,
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
    approvableHint: Boolean(coverageComplete && generationSucceeded),
    reasonCodes: [...new Set(reasonCodes)],
    uncoveredAcKeys,
    uncoveredFrIds,
    unresolvedStoryIds: unresolved,
    leafCount,
    failures,
  };
}

/**
 * Evaluate from container.planning (HOW / Gate2).
 * Soft-skip when no wbs.meta coverage fields (legacy packs without this stamp).
 */
function evaluateWbsCoverageFromContainer(container = {}) {
  const planning =
    container.planning && typeof container.planning === 'object' ? container.planning : {};
  const meta = readWbsMeta(planning);
  const hasCoverageFields =
    meta.coverageComplete === true ||
    meta.coverageComplete === false ||
    asArray(meta.uncoveredAcKeys).length > 0 ||
    asArray(meta.uncoveredFrIds).length > 0 ||
    asArray(meta.unresolvedStoryIds).length > 0 ||
    asArray(meta.unresolvedUnitIds).length > 0;

  if (!hasCoverageFields) {
    return {
      enforce: false,
      legacySoftSkip: true,
      generationSucceeded: asArray(planning.tasks).length > 0,
      coverageComplete: true,
      approvableHint: true,
      reasonCodes: [],
      failures: [],
    };
  }

  const evaluated = evaluateWbsCoverage(meta, { tasks: planning.tasks });
  return {
    enforce: true,
    legacySoftSkip: false,
    ...evaluated,
  };
}

/**
 * Stamp coverage flags onto WBS meta (pure).
 */
function stampWbsCoverageMeta(meta = {}) {
  const evaluated = evaluateWbsCoverage(meta);
  return {
    ...meta,
    coverageComplete: evaluated.coverageComplete,
    generationSucceeded: evaluated.generationSucceeded,
    approvableHint: evaluated.approvableHint,
    reasonCodes: [
      ...new Set([...(asArray(meta.reasonCodes) || []), ...evaluated.reasonCodes]),
    ],
  };
}

module.exports = {
  CODE_AC_COVERAGE_GAP,
  CODE_MISSING_AC,
  evaluateWbsCoverage,
  evaluateWbsCoverageFromContainer,
  stampWbsCoverageMeta,
  readWbsMeta,
};
