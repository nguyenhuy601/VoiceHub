/**
 * Phase 1 stage 10 — Pre-approval validation before Waiting Review.
 * Reuses Gate A + light pack schema checks. Does not replace Gate1 approve.
 */

function check(id, passed, detail = {}) {
  return { id, passed: Boolean(passed), ...detail };
}

/**
 * @returns {{ passed: boolean, checks: array, gateA: object|null, schemaVersion: string }}
 */
function runPreApprovalValidation(pack = {}) {
  const tools = pack?.aiAnalysis?.analyses?.requirementTools || null;
  const gateA =
    tools?.gateA && typeof tools.gateA === 'object'
      ? tools.gateA
      : pack?.aiAnalysis?.analyses?.preApproval?.gateA || null;
  const facts = tools?.facts && typeof tools.facts === 'object' ? tools.facts : {};

  const overview = pack?.overview || {};
  const frList = Array.isArray(pack?.functionalRequirements)
    ? pack.functionalRequirements
    : [];

  const checks = [];

  const hasName = Boolean(String(overview.requirementName || '').trim());
  checks.push(check('schema.requirementName', hasName, { value: hasName }));

  const hasFr = frList.length > 0;
  checks.push(check('schema.hasFunctionalRequirements', hasFr, { count: frList.length }));

  const frMissingId = frList.filter(
    (r) => !String(r.externalId || '').trim() && !String(r._id || '').trim()
  ).length;
  checks.push(
    check('schema.frExternalIds', frMissingId === 0, { missingCount: frMissingId })
  );

  const coverageOk =
    facts['coverage.passed'] === true ||
    (facts['coverage.weighted'] != null && Number(facts['coverage.weighted']) >= 0.8);
  checks.push(
    check('coverage', coverageOk || gateA?.checks?.some((c) => c.id === 'coverage' && c.passed), {
      weighted: facts['coverage.weighted'] ?? null,
    })
  );

  const completenessOk =
    facts['completeness.score'] == null || Number(facts['completeness.score']) >= 0.5;
  checks.push(
    check('completeness', completenessOk, {
      score: facts['completeness.score'] ?? null,
    })
  );

  const consistencyOk =
    facts['consistency.conflictCount'] == null ||
    Number(facts['consistency.conflictCount']) <= 0;
  checks.push(
    check('consistency', consistencyOk, {
      conflictCount: facts['consistency.conflictCount'] ?? null,
    })
  );

  const traceOk =
    (facts['trace.danglingCount'] == null || Number(facts['trace.danglingCount']) === 0) &&
    (facts['trace.orphanCount'] == null || Number(facts['trace.orphanCount']) === 0);
  checks.push(
    check('traceability', traceOk, {
      dangling: facts['trace.danglingCount'] ?? null,
      orphan: facts['trace.orphanCount'] ?? null,
    })
  );

  const gateAPassed =
    gateA?.passed === true ||
    (gateA == null &&
      checks.filter((c) =>
        ['coverage', 'completeness', 'consistency'].includes(c.id)
      ).every((c) => c.passed));
  checks.push(
    check('gateA', gateA != null ? Boolean(gateA.passed) : gateAPassed, {
      source: gateA ? 'requirementTools.gateA' : 'derived',
    })
  );

  const sourceMapOk = Boolean(
    pack?.sourceFileId ||
      pack?.sourceFileName ||
      pack?.aiAnalysisActiveSnapshotId ||
      pack?.importSetId
  );
  checks.push(check('source.mapping', sourceMapOk));

  const insights = pack?.aiAnalysis?.analyses?.requirementInsights;
  checks.push(
    check('insights.present', Boolean(insights && insights.schemaVersion), {
      schema: insights?.schemaVersion || null,
    })
  );

  const proposed = pack?.aiAnalysis?.analyses?.proposedSrs;
  checks.push(
    check('proposedSrs.present', Boolean(proposed && proposed.schemaVersion), {
      schema: proposed?.schemaVersion || null,
    })
  );

  const passed = checks.every((c) => c.passed);

  return {
    schemaVersion: 'preApproval.v1',
    passed,
    checks,
    gateA: gateA
      ? { passed: Boolean(gateA.passed), checks: gateA.checks || [] }
      : null,
    meta: {
      note: 'Pre-approval for Waiting Review — Gate1 approve remains separate',
    },
  };
}

module.exports = {
  runPreApprovalValidation,
};
