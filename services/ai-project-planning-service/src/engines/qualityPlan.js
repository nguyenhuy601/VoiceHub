/**
 * Quality & Testing Plan — deterministic HOW artifact (Step 4).
 * Consumes approved SRS (UC / AC / NFR) + WBS leaves; no LLM.
 * Does NOT materialize TestCase rows (seed after Gate2 — Step 9).
 */

const CATALOG_CAP = 120;
const AC_COVERAGE_CAP = 200;
const NFR_COVERAGE_CAP = 80;

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function clip(s, max = 240) {
  const t = String(s || '').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function splitAcLines(raw) {
  const text = String(raw || '').trim();
  if (!text) return [];
  const parts = text
    .split(/\r?\n|(?:;\s*)|(?:(?<=\d)[.)]\s+)/)
    .map((p) => p.replace(/^[-*•]\s*/, '').trim())
    .filter((p) => p.length >= 2);
  return parts.length > 1 ? parts : [text];
}

function slug(raw, max = 48) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max);
}

function packUseCases(pack = {}) {
  return asArray(pack.useCases).filter((u) => u && typeof u === 'object');
}

function packNfrs(pack = {}) {
  return asArray(pack.nonFunctionalRequirements).filter((n) => n && typeof n === 'object');
}

function packFrs(pack = {}) {
  return asArray(pack.functionalRequirements).filter((f) => f && typeof f === 'object');
}

function leafTasks(container = {}) {
  return asArray(container?.planning?.tasks).filter((t) => {
    if (!t || typeof t !== 'object') return false;
    const level = String(t.level || 'task').toLowerCase();
    return level === 'task' || level === 'subtask' || !t.level;
  });
}

function frIdOf(fr, index = 0) {
  return String(fr?.externalId || fr?.id || `FR-${index + 1}`).trim();
}

function ucKeyOf(uc, index = 0) {
  return String(uc?.externalId || uc?.ucKey || uc?.id || `UC-${index + 1}`).trim();
}

function nfrIdOf(nfr, index = 0) {
  return String(nfr?.externalId || nfr?.nfrId || nfr?.id || `NFR-${index + 1}`).trim();
}

function nfrCategory(nfr) {
  return String(nfr?.category || nfr?.type || 'general').trim().toLowerCase() || 'general';
}

function testLevelForNfr(category) {
  const c = String(category || '').toLowerCase();
  if (/perf|latency|throughput|scal/.test(c)) return 'nfr';
  if (/secur|auth|privacy|compliance/.test(c)) return 'nfr';
  if (/avail|reliab|recover|dr/.test(c)) return 'nfr';
  if (/usab|a11y|accessib/.test(c)) return 'uat';
  return 'nfr';
}

function techniqueForNfr(category) {
  const c = String(category || '').toLowerCase();
  if (/perf|latency|throughput/.test(c)) return 'load_perf';
  if (/secur|auth|privacy/.test(c)) return 'security_scan';
  if (/avail|reliab|recover/.test(c)) return 'chaos_or_failover';
  if (/usab|a11y/.test(c)) return 'uat_checklist';
  return 'nfr_checklist';
}

function linkTaskForUc(tasks, uc) {
  const ucKey = ucKeyOf(uc);
  const nameBlob = `${uc.name || ''} ${uc.title || ''}`.toLowerCase();
  for (const t of tasks) {
    const srcUc = String(t.sourceUcKey || t.ucKey || '').trim();
    if (srcUc && srcUc === ucKey) return String(t.id || t.taskId || '');
    const frIds = asArray(t.sourceFrIds || t.frIds).map(String);
    const related = asArray(uc.relatedFrIds || uc.frIds).map(String);
    if (related.length && frIds.some((id) => related.includes(id))) {
      return String(t.id || t.taskId || '');
    }
    const title = String(t.name || t.title || '').toLowerCase();
    if (nameBlob && title && (title.includes(nameBlob.slice(0, 24)) || nameBlob.includes(title.slice(0, 24)))) {
      return String(t.id || t.taskId || '');
    }
  }
  return '';
}

function buildDefaultLevels() {
  return [
    {
      level: 'unit',
      scope: 'Pure functions / modules / services without I/O',
      ownerRole: 'backend_developer',
      toolsHint: 'jest|vitest|junit',
      env: 'dev',
    },
    {
      level: 'integration',
      scope: 'API + DB + service boundaries',
      ownerRole: 'backend_developer',
      toolsHint: 'supertest|testcontainers',
      env: 'dev',
    },
    {
      level: 'e2e',
      scope: 'Critical user journeys across UI + API',
      ownerRole: 'qa_engineer',
      toolsHint: 'playwright|cypress',
      env: 'staging',
    },
    {
      level: 'uat',
      scope: 'Business acceptance against AC / UC',
      ownerRole: 'qa_engineer',
      toolsHint: 'checklist|manual',
      env: 'staging',
    },
    {
      level: 'nfr',
      scope: 'Performance / security / reliability checks',
      ownerRole: 'qa_engineer',
      toolsHint: 'k6|owasp|observability',
      env: 'staging',
    },
  ];
}

function hasRequiredLevels(levels) {
  const set = new Set(asArray(levels).map((l) => String(l?.level || '').toLowerCase()));
  return set.has('unit') && set.has('integration') && (set.has('e2e') || set.has('uat'));
}

/**
 * @param {object} container
 * @param {object} pack — freeze pack / approved SRS shape
 * @returns {object} qualityPlan result
 */
function runQualityPlanEngine(container = {}, pack = {}) {
  const frs = packFrs(pack);
  const useCases = packUseCases(pack);
  const nfrs = packNfrs(pack);
  const tasks = leafTasks(container);
  const openQuestions = [];

  if (!useCases.length) {
    openQuestions.push({
      id: 'Q-UC-MISSING',
      topic: 'use_cases',
      message: 'No use cases on approved SRS — catalogPlan will be thin until UC exist',
    });
  }
  const frWithAc = frs.filter((f) => String(f.acceptanceCriteria || f.ac || '').trim());
  if (!frWithAc.length && !useCases.some((u) => String(u.acceptanceCriteria || u.ac || '').trim())) {
    openQuestions.push({
      id: 'Q-AC-MISSING',
      topic: 'acceptance_criteria',
      message: 'No acceptance criteria on FR/UC — acCoverage empty',
    });
  }

  const levels = buildDefaultLevels();

  const acCoverage = [];
  for (let i = 0; i < frs.length && acCoverage.length < AC_COVERAGE_CAP; i += 1) {
    const fr = frs[i];
    const frId = frIdOf(fr, i);
    const lines = splitAcLines(fr.acceptanceCriteria || fr.ac || '');
    for (let j = 0; j < lines.length && acCoverage.length < AC_COVERAGE_CAP; j += 1) {
      const ucKey =
        asArray(fr.relatedUcKeys || fr.useCaseIds)
          .map(String)
          .find(Boolean) || '';
      acCoverage.push({
        frId,
        ucKey: ucKey || null,
        acIndex: j + 1,
        acText: clip(lines[j], 180),
        proposedTcKeys: [`TC-${slug(frId)}-AC${j + 1}`],
        priority: String(fr.priority || 'should').toLowerCase(),
      });
    }
  }

  const catalogPlan = [];
  for (let i = 0; i < useCases.length && catalogPlan.length < CATALOG_CAP; i += 1) {
    const uc = useCases[i];
    const sourceUcKey = ucKeyOf(uc, i);
    const linkedWbsTaskId = linkTaskForUc(tasks, uc) || null;
    const title = clip(uc.name || uc.title || sourceUcKey, 120);
    const tcKey = `TC-${slug(sourceUcKey) || i + 1}`;
    catalogPlan.push({
      tcKey,
      title: `Verify: ${title}`,
      sourceUcKey,
      level: 'e2e',
      linkedWbsTaskId,
      automate: true,
      priority: String(uc.priority || 'should').toLowerCase(),
    });
    // Extra UAT row from first real AC line on UC (no invent when AC empty)
    const ucAc = splitAcLines(uc.acceptanceCriteria || uc.ac || uc.postcondition || '');
    if (ucAc.length && catalogPlan.length < CATALOG_CAP) {
      catalogPlan.push({
        tcKey: `${tcKey}-AC`,
        title: clip(`AC: ${ucAc[0]}`, 120),
        sourceUcKey,
        level: 'uat',
        linkedWbsTaskId,
        automate: false,
        priority: String(uc.priority || 'should').toLowerCase(),
      });
    }
  }

  // FR-only AC → catalog from real AC when no UC (empty if no AC)
  if (!catalogPlan.length) {
    for (let i = 0; i < Math.min(acCoverage.length, 40); i += 1) {
      const row = acCoverage[i];
      catalogPlan.push({
        tcKey: row.proposedTcKeys[0] || `TC-FR-${i + 1}`,
        title: clip(`AC: ${row.acText}`, 120),
        sourceUcKey: row.ucKey || null,
        sourceFrId: row.frId,
        level: 'uat',
        linkedWbsTaskId: null,
        automate: false,
        priority: row.priority,
      });
    }
  }

  const nfrCoverage = [];
  for (let i = 0; i < nfrs.length && nfrCoverage.length < NFR_COVERAGE_CAP; i += 1) {
    const nfr = nfrs[i];
    const nfrId = nfrIdOf(nfr, i);
    const category = nfrCategory(nfr);
    const requirement = clip(
      nfr.requirement || nfr.name || nfr.title || nfr.description || nfrId,
      180
    );
    nfrCoverage.push({
      nfrId,
      category,
      testLevel: testLevelForNfr(category),
      technique: techniqueForNfr(category),
      passCriteria: clip(nfr.target || requirement, 160),
      requirement,
      priority: String(nfr.priority || '').toLowerCase() || undefined,
    });
  }

  const strategy = {
    pyramid: {
      unitPct: 0.6,
      integrationPct: 0.25,
      e2ePct: 0.15,
    },
    shiftLeft: true,
    automationTargetPct: 0.7,
  };

  const qualityPlan = {
    strategy,
    levels,
    nfrCoverage,
    acCoverage,
    catalogPlan,
    dod: {
      story: [
        'AC covered by catalogPlan or linked TC',
        'Unit tests for changed modules',
        'No critical NFR unchecked without waiver',
      ],
      release: [
        'e2e/uat smoke for critical UC',
        'NFR high/critical have passCriteria evidence',
        'Regression suite green on staging',
      ],
    },
    entryExit: {
      qaEntry: ['Code complete for story scope', 'AC clarified', 'Env staging available'],
      uatEntry: ['QA smoke passed', 'Data fixtures ready'],
      releaseExit: ['UAT sign-off', 'NFR gates met or waived'],
    },
    environments: ['dev', 'staging'],
    assumptions: [
      'Deterministic plan from SRS + WBS; PM may edit at Gate2',
      'TestCase materialize happens after Gate2 approve (not in this tool)',
    ],
    openQuestions,
    meta: {
      source: 'heuristic',
      llmCalls: 0,
      frCount: frs.length,
      ucCount: useCases.length,
      nfrCount: nfrs.length,
      acCoverageCount: acCoverage.length,
      catalogCount: catalogPlan.length,
      hasRequiredLevels: hasRequiredLevels(levels),
    },
  };

  const { stampQualityCoverageMeta } = require('../validation/qualityCoverageGate');
  const stamped = stampQualityCoverageMeta(qualityPlan);

  return {
    status: 'ready',
    model: null,
    generatedAt: new Date().toISOString(),
    qualityPlan: stamped,
    meta: stamped.meta,
  };
}

function applyQualityPlanToContainer(container, result) {
  const { stampQualityCoverageMeta } = require('../validation/qualityCoverageGate');
  const qp = result?.qualityPlan
    ? stampQualityCoverageMeta(result.qualityPlan)
    : null;
  const next = {
    ...container,
    planning: { ...(container?.planning || {}) },
  };
  next.planning.qualityPlan = qp;
  return next;
}

function isQualityPlanStructurallyOk(qualityPlan) {
  if (!qualityPlan || typeof qualityPlan !== 'object') return false;
  const meta = qualityPlan.meta && typeof qualityPlan.meta === 'object' ? qualityPlan.meta : {};
  if (meta.coverageComplete === true) return true;
  if (meta.coverageComplete === false) return false;
  // Unstamped: content alone is NOT enough — evaluateCoverage decides
  const { evaluateQualityCoverage } = require('../validation/qualityCoverageGate');
  return evaluateQualityCoverage(qualityPlan).coverageComplete === true;
}

module.exports = {
  runQualityPlanEngine,
  applyQualityPlanToContainer,
  isQualityPlanStructurallyOk,
  hasRequiredLevels,
  buildDefaultLevels,
  CATALOG_CAP,
};
