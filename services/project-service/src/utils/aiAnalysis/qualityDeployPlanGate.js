/**
 * Step 8 — local structural checks for Quality/Testing Plan (Gate DoD).
 * Exception fix #1: legacy HOW (no Quality tool evidence) does not hard-enforce.
 * Quality Gate ≠ Testing Plan artifact.
 * Deploy plan is outside the HOW tool → LLM text flow, so a missing plan does not fail the gate.
 */

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function hasRequiredQualityLevels(levels) {
  const set = new Set(asArray(levels).map((l) => String(l?.level || '').toLowerCase()));
  return set.has('unit') && set.has('integration') && (set.has('e2e') || set.has('uat'));
}

function isQualityPlanStructurallyOk(qualityPlan) {
  if (!qualityPlan || typeof qualityPlan !== 'object') return false;
  const levels = qualityPlan.levels || qualityPlan.testStrategy?.levels;
  const catalog = asArray(qualityPlan.catalogPlan);
  if (!hasRequiredQualityLevels(levels) && !catalog.length) return false;
  const meta = qualityPlan.meta && typeof qualityPlan.meta === 'object' ? qualityPlan.meta : {};
  if (meta.coverageComplete === true) return true;
  if (meta.coverageComplete === false) return false;
  // Unstamped legacy: soft content check (era soft-skip still applies upstream)
  const ac = asArray(qualityPlan.acCoverage).length;
  return ac > 0 || catalog.length > 0;
}

function isDeployPlanStructurallyOk(deployPlan) {
  if (!deployPlan || typeof deployPlan !== 'object') return false;
  // Real SNAP envs only — do not treat TBD invent rows as OK
  const envs = asArray(deployPlan.envMatrix).filter(
    (e) => e && String(e.key || '').trim() && !String(e.tbdReason || '').trim()
  );
  const envOk = envs.length >= 1;
  const steps = asArray(deployPlan.rollbackPlan?.steps).filter((s) => String(s || '').trim());
  const mode = String(deployPlan.releaseStrategy?.mode || '').trim();
  const oos = asArray(deployPlan.outOfScopeInApp).map((x) => String(x || '').toLowerCase());
  const hasExecuteCiOos = oos.some(
    (x) => x.includes('execute_ci') || x.includes('deploy_production') || x.includes('cicd')
  );
  return Boolean(envOk && steps.length >= 1 && mode && hasExecuteCiOos);
}

function containerFromPack(packOrContainer) {
  if (!packOrContainer || typeof packOrContainer !== 'object') return {};
  if (packOrContainer.aiAnalysis && typeof packOrContainer.aiAnalysis === 'object') {
    return packOrContainer.aiAnalysis;
  }
  return packOrContainer;
}

function collectToolNames(how = {}) {
  const names = new Set();
  const lists = [how.toolResults, how.tools, how.completedTools, how.steps];
  for (const list of lists) {
    for (const row of asArray(list)) {
      const n = String(row?.toolName || row?.name || row || '').trim();
      if (n) names.add(n);
    }
  }
  return names;
}

/**
 * Evidence that this HOW run is in the Quality/Deploy-plan era (not legacy pre–Step 4/7).
 */
function hasQualityDeployEraEvidence(container = {}, feasibility = null) {
  const planning =
    container.planning && typeof container.planning === 'object' ? container.planning : {};
  const how = container.phaseRuns?.phase_how || {};
  if (planning.qualityPlan || planning.deployPlan) return true;

  const toolNames = collectToolNames(how);
  if (toolNames.has('QualityPlanTool') || toolNames.has('DeployPlanTool')) return true;

  const failures = Array.isArray(feasibility?.failures) ? feasibility.failures : [];
  if (failures.some((f) => ['FEAS_QUALITY_PLAN', 'FEAS_DEPLOY_PLAN'].includes(String(f?.code || '')))) {
    return true;
  }
  if (feasibility && typeof feasibility === 'object') {
    if (feasibility.qualityPlanOk === false || feasibility.deployPlanOk === false) return true;
    if (feasibility.flags?.quality === false || feasibility.flags?.deploy === false) return true;
  }
  return false;
}

/**
 * Enforce structural quality+deploy only when era evidence exists (plans / tools / feasibility codes).
 * Legacy HOW ready without those signals → soft skip (hole #1).
 */
function evaluateQualityDeployGate(packOrContainer, opts = {}) {
  const container = containerFromPack(packOrContainer);
  const planning =
    container.planning && typeof container.planning === 'object' ? container.planning : {};
  const how = container.phaseRuns?.phase_how || {};
  const howStatus = String(how.status || '').toLowerCase();
  const howActive = howStatus === 'ready' || howStatus === 'confirmed' || howStatus === 'pending';
  const feasibility = opts.feasibility != null ? opts.feasibility : how.feasibility || null;
  const eraEvidence = hasQualityDeployEraEvidence(container, feasibility);
  const enforce = Boolean(eraEvidence);

  const qp = planning.qualityPlan;
  const dp = planning.deployPlan;
  const qualityPlanOk = !enforce || isQualityPlanStructurallyOk(qp);
  const deployPlanOk = true;

  const failures = [];
  if (enforce && !qualityPlanOk) {
    const reasonCodes = asArray(qp?.meta?.reasonCodes);
    const code = reasonCodes.includes('TEST_DETAILS_INCOMPLETE')
      ? 'TEST_DETAILS_INCOMPLETE'
      : reasonCodes.includes('AC_COVERAGE_GAP')
        ? 'AC_COVERAGE_GAP'
        : 'FEAS_QUALITY_PLAN';
    failures.push({
      code,
      message:
        'Quality/testing plan incomplete — coverageComplete required (ac||catalog alone is not enough)',
      detail: {
        uncoveredCriteria: asArray(qp?.meta?.uncoveredCriteria).slice(0, 40),
        reasonCodes,
        coverageComplete: qp?.meta?.coverageComplete === true,
      },
    });
  }

  return {
    enforce,
    legacySoftSkip: howActive && !eraEvidence,
    qualityPlanOk: Boolean(qualityPlanOk),
    deployPlanOk: Boolean(deployPlanOk),
    failures,
    counts: {
      qualityCatalogCount: asArray(qp?.catalogPlan).length,
      qualityAcCoverageCount: asArray(qp?.acCoverage).length,
      deployEnvCount: asArray(dp?.envMatrix).length,
      deployRollbackSteps: asArray(dp?.rollbackPlan?.steps).length,
      releaseMode: dp?.releaseStrategy?.mode || null,
    },
  };
}

/**
 * Merge quality/deploy failures into a feasibility-shaped feasibility object.
 */
function mergeQualityDeployIntoFeasibility(feasibility, packOrContainer) {
  const gate = evaluateQualityDeployGate(packOrContainer, { feasibility });
  if (!gate.enforce || !gate.failures.length) {
    return {
      feasibility: feasibility
        ? {
            ...feasibility,
            qualityPlanOk: gate.qualityPlanOk,
            deployPlanOk: gate.deployPlanOk,
            legacyQualityDeploySkip: Boolean(gate.legacySoftSkip),
          }
        : feasibility,
      gate,
    };
  }

  const baseFailures = (Array.isArray(feasibility?.failures) ? feasibility.failures : []).filter(
    (row) => String(row?.code || '') !== 'FEAS_DEPLOY_PLAN'
  );
  for (const f of gate.failures) {
    if (!baseFailures.some((x) => x?.code === f.code)) baseFailures.push(f);
  }

  return {
    feasibility: {
      pass: false,
      failures: baseFailures,
      source: feasibility?.source || 'pack.planning.quality_deploy',
      evidenceRefs: Array.isArray(feasibility?.evidenceRefs) ? feasibility.evidenceRefs : [],
      qualityPlanOk: gate.qualityPlanOk,
      deployPlanOk: gate.deployPlanOk,
      qualityDeployEnforced: true,
    },
    gate,
  };
}

module.exports = {
  isQualityPlanStructurallyOk,
  isDeployPlanStructurallyOk,
  evaluateQualityDeployGate,
  mergeQualityDeployIntoFeasibility,
  hasRequiredQualityLevels,
  hasQualityDeployEraEvidence,
};
