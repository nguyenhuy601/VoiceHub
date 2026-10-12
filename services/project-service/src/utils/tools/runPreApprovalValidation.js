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

  // Coverage / Gate A are advisory — do not hard-fail pre-approval.
  const dupCheck = gateA?.checks?.find((c) => c?.id === 'duplicates');
  const missCheck = gateA?.checks?.find((c) => c?.id === 'missing_sections');
  checks.push(
    check('duplicates', dupCheck ? dupCheck.passed !== false : true, {
      value: dupCheck?.value ?? null,
      advisory: true,
    })
  );
  checks.push(
    check('missing_sections', missCheck ? missCheck.passed !== false : true, {
      value: missCheck?.value ?? null,
      advisory: true,
    })
  );

  const completenessOk =
    facts['completeness.score'] == null || Number(facts['completeness.score']) >= 0.5;
  checks.push(
    check('completeness', completenessOk, {
      score: facts['completeness.score'] ?? null,
      advisory: true,
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
      advisory: true,
    })
  );

  // Gate A present → informational; overall preApproval ignores advisory fails below.
  checks.push(
    check('gateA', true, {
      source: gateA ? 'requirementTools.gateA' : 'derived',
      advisory: true,
      hasWarnings: Boolean(gateA?.hasWarnings || gateA?.passed === false),
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

  // Advisory checks never hard-fail pre-approval (Gate A notify-only).
  const advisoryIds = new Set([
    'duplicates',
    'missing_sections',
    'completeness',
    'traceability',
    'gateA',
    'coverage',
  ]);
  const passed = checks.every(
    (c) => c.advisory === true || advisoryIds.has(c.id) || c.passed
  );

  return {
    schemaVersion: 'preApproval.v2',
    passed,
    checks,
    gateA: gateA
      ? {
          passed: Boolean(gateA.passed),
          hasWarnings: Boolean(gateA.hasWarnings),
          mode: gateA.mode || 'advisory',
          checks: gateA.checks || [],
        }
      : null,
    meta: {
      note: 'Pre-approval for Waiting Review — Gate A advisory; Gate1 approve remains separate',
    },
  };
}

module.exports = {
  runPreApprovalValidation,
};
