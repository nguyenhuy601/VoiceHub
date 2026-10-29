/**
 * Quality coverage gate — ac||catalog > 0 is content signal only, not "plan complete".
 * UC not required for every TC; ≥1 valid source (FR|UC|NFR|BR|API) required.
 */

const CODES = {
  AC_COVERAGE_GAP: 'AC_COVERAGE_GAP',
  TEST_DETAILS_INCOMPLETE: 'TEST_DETAILS_INCOMPLETE',
  MISSING_REQUIRED_UC_REF: 'MISSING_REQUIRED_UC_REF',
  INVALID_SOURCE_REF: 'INVALID_SOURCE_REF',
};

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function isExecutableTc(tc) {
  if (!tc || typeof tc !== 'object') return false;
  if (String(tc.completeness || '').toLowerCase() === 'executable') return true;
  if (String(tc.reviewStatus || '').toLowerCase() === 'proposed') return true;
  return false;
}

function tcCoversFr(tc, frId) {
  const id = String(frId || '').trim();
  if (!id) return false;
  return asArray(tc.sourceFrIds).map(String).includes(id);
}

function tcCoversUc(tc, ucKey) {
  const id = String(ucKey || '').trim();
  if (!id) return false;
  if (String(tc.sourceUcKey || '').trim() === id) return true;
  return asArray(tc.sourceRefs).some(
    (r) => String(r?.type || '').toUpperCase() === 'UC' && String(r?.id || '') === id
  );
}

function tcCoversNfr(tc, nfrId) {
  const id = String(nfrId || '').trim();
  if (!id) return false;
  return asArray(tc.sourceRefs).some(
    (r) => String(r?.type || '').toUpperCase() === 'NFR' && String(r?.id || '') === id
  );
}

/**
 * @param {object} qualityPlan
 * @returns {{
 *   coverageComplete: boolean,
 *   generationSucceeded: boolean,
 *   uncoveredCriteria: object[],
 *   reasonCodes: string[],
 *   failures: object[],
 * }}
 */
function evaluateQualityCoverage(qualityPlan = {}) {
  const qp = qualityPlan && typeof qualityPlan === 'object' ? qualityPlan : {};
  const acCoverage = asArray(qp.acCoverage);
  const nfrCoverage = asArray(qp.nfrCoverage);
  const catalog = asArray(qp.catalogPlan);
  const executable = catalog.filter(isExecutableTc);
  const incomplete = catalog.filter((tc) => !isExecutableTc(tc));

  const uncoveredCriteria = [];
  for (const row of acCoverage) {
    const frId = row?.frId || row?.fr || '';
    const ucKey = row?.ucKey || row?.sourceUcKey || '';
    const covered = executable.some(
      (tc) => tcCoversFr(tc, frId) || (ucKey && tcCoversUc(tc, ucKey))
    );
    if (!covered) {
      uncoveredCriteria.push({
        type: 'AC',
        frId: frId || null,
        ucKey: ucKey || null,
        acIndex: row?.acIndex ?? null,
      });
    }
  }

  for (const row of nfrCoverage) {
    const nfrId = String(row?.nfrId || row?.id || '').trim();
    const pri = String(row?.priority || '').toLowerCase();
    if (!nfrId) continue;
    if (pri && !['high', 'critical', 'must'].includes(pri)) continue;
    const covered = executable.some((tc) => tcCoversNfr(tc, nfrId));
    if (!covered) {
      uncoveredCriteria.push({ type: 'NFR', nfrId });
    }
  }

  const generationSucceeded = catalog.length > 0 || acCoverage.length > 0;
  const reasonCodes = [];
  if (uncoveredCriteria.length) reasonCodes.push(CODES.AC_COVERAGE_GAP);
  if (incomplete.length && uncoveredCriteria.length) {
    reasonCodes.push(CODES.TEST_DETAILS_INCOMPLETE);
  }
  // Catalog-only incomplete with no executable and no AC list → still incomplete
  if (generationSucceeded && !executable.length && acCoverage.length === 0 && nfrCoverage.length === 0) {
    reasonCodes.push(CODES.TEST_DETAILS_INCOMPLETE);
  }

  const metaComplete = qp.meta?.coverageComplete;
  const coverageComplete =
    metaComplete === true
      ? true
      : metaComplete === false
        ? false
        : generationSucceeded &&
          uncoveredCriteria.length === 0 &&
          (acCoverage.length > 0 || nfrCoverage.length > 0
            ? executable.length > 0
            : executable.length > 0);

  const failures = [];
  if (!coverageComplete && generationSucceeded) {
    const code = reasonCodes.includes(CODES.TEST_DETAILS_INCOMPLETE) && !uncoveredCriteria.length
      ? CODES.TEST_DETAILS_INCOMPLETE
      : CODES.AC_COVERAGE_GAP;
    failures.push({
      code,
      message:
        'Quality/testing coverage incomplete — còn tiêu chí bắt buộc chưa có TC thực thi được',
      detail: {
        uncoveredCriteria: uncoveredCriteria.slice(0, 40),
        incompleteCount: incomplete.length,
        executableCount: executable.length,
        coverageComplete: false,
      },
    });
  }

  return {
    generationSucceeded,
    coverageComplete: Boolean(coverageComplete),
    uncoveredCriteria,
    reasonCodes: [...new Set(reasonCodes)],
    failures,
    executableCount: executable.length,
    incompleteCount: incomplete.length,
  };
}

function stampQualityCoverageMeta(qualityPlan = {}) {
  const evaluated = evaluateQualityCoverage(qualityPlan);
  const meta = {
    ...(qualityPlan.meta && typeof qualityPlan.meta === 'object' ? qualityPlan.meta : {}),
    coverageComplete: evaluated.coverageComplete,
    generationSucceeded: evaluated.generationSucceeded,
    uncoveredCriteria: evaluated.uncoveredCriteria,
    reasonCodes: [
      ...new Set([
        ...asArray(qualityPlan.meta?.reasonCodes),
        ...evaluated.reasonCodes,
      ]),
    ],
  };
  return {
    ...qualityPlan,
    meta,
  };
}

/**
 * Map acceptSourceRefs / acceptTestCase failure reason → Gate2 codes.
 */
function mapQualityAcceptReason(reason) {
  const r = String(reason || '');
  if (r === 'MISSING_REQUIRED_UC_REF' || r === 'uc_not_in_allow') {
    return CODES.MISSING_REQUIRED_UC_REF;
  }
  if (
    r === 'INVALID_SOURCE_REF' ||
    r === 'fr_not_in_allow' ||
    r === 'source_not_in_allow' ||
    r === 'source_ref_invalid'
  ) {
    return CODES.INVALID_SOURCE_REF;
  }
  if (r === 'testcase_steps_invalid' || r === 'TEST_DETAILS_INCOMPLETE') {
    return CODES.TEST_DETAILS_INCOMPLETE;
  }
  return r || CODES.INVALID_SOURCE_REF;
}

module.exports = {
  CODES,
  evaluateQualityCoverage,
  stampQualityCoverageMeta,
  mapQualityAcceptReason,
  isExecutableTc,
};
