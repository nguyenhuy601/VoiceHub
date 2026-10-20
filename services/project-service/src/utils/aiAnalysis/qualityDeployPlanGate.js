/**
 * Step 8 — local structural checks for Quality/Testing Plan vs Deploy Plan (Gate DoD).
 * Exception fix #1: legacy HOW (no Quality/Deploy tool evidence) does not hard-enforce.
 * Quality Gate ≠ Testing Plan artifact.
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
  if (!hasRequiredQualityLevels(qualityPlan.levels)) return false;
  const ac = asArray(qualityPlan.acCoverage).length;
  const catalog = asArray(qualityPlan.catalogPlan).length;
  return ac > 0 || catalog > 0;
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
 * Enforce structural quality+deploy only when era evidence exists (plans / tools / G13 codes).
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
  const deployPlanOk = !enforce || isDeployPlanStructurallyOk(dp);

  const failures = [];
  if (enforce && !qualityPlanOk) {
    failures.push({
      code: 'FEAS_QUALITY_PLAN',
      message:
        'Quality/testing plan incomplete (need levels + AC/catalog coverage) — Quality Gate ≠ Testing Plan artifact',
    });
  }
  if (enforce && !deployPlanOk) {
    failures.push({
      code: 'FEAS_DEPLOY_PLAN',
      message:
        'Deploy plan incomplete (need envMatrix from SNAP, rollback steps, release mode, outOfScopeInApp)',
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
 * Merge quality/deploy failures into a G13-shaped feasibility object.
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

  const baseFailures = Array.isArray(feasibility?.failures) ? [...feasibility.failures] : [];
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
