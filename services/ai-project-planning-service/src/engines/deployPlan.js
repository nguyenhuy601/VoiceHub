/**
 * Deploy / Release Plan — deterministic HOW artifact (Step 7).
 * Plan-only: Phase 4 execution remains checklist + evidence outside app.
 * Consumes SNAP technical (cicd / environments / deployment) + schedulePlan.
 */

const OUT_OF_SCOPE_IN_APP = Object.freeze([
  'execute_ci_pipeline',
  'deploy_production_button',
  'trigger_rollback_in_app',
  'mutate_external_cicd',
]);

const DEFAULT_ENVS = Object.freeze([
  { key: 'dev', name: 'Development', purpose: 'feature integration' },
  { key: 'staging', name: 'Staging', purpose: 'UAT / pre-prod smoke' },
]);

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function clip(s, max = 240) {
  const t = String(s || '').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function pickTechnical(toolData = {}, container = {}) {
  const fromTool =
    toolData.technical && typeof toolData.technical === 'object' ? toolData.technical : null;
  const fromContainer =
    container?.planning?.technical && typeof container.planning.technical === 'object'
      ? container.planning.technical
      : null;
  const fromAnalyses =
    container?.analyses?.technical && typeof container.analyses.technical === 'object'
      ? container.analyses.technical
      : null;
  return fromTool || fromContainer || fromAnalyses || {};
}

function normalizeEnvRow(raw, index = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const key = String(raw.key || raw.name || `env-${index + 1}`)
    .trim()
    .toLowerCase()
    .slice(0, 32);
  if (!key) return null;
  const name = String(raw.name || key).trim().slice(0, 120) || key;
  const url = String(raw.url || '').trim().slice(0, 500);
  return {
    key,
    name,
    purpose: clip(raw.purpose || '', 120) || undefined,
    url: url || null,
    urlTbd: !url,
  };
}

function buildEnvMatrix(technical = {}, openQuestions = []) {
  const fromSnap = asArray(technical.environments)
    .map((e, i) => normalizeEnvRow(e, i))
    .filter(Boolean);

  let envMatrix = fromSnap.slice(0, 8);
  if (envMatrix.length < 2) {
    const have = new Set(envMatrix.map((e) => e.key));
    for (const d of DEFAULT_ENVS) {
      if (have.has(d.key)) continue;
      envMatrix.push({
        key: d.key,
        name: d.name,
        purpose: d.purpose,
        url: null,
        urlTbd: true,
        tbdReason: 'Not on Project.technicalSetup — placeholder for Gate2',
      });
      have.add(d.key);
      if (envMatrix.length >= 2) break;
    }
    openQuestions.push({
      id: 'Q-ENV-TBD',
      topic: 'environments',
      message:
        'Fewer than 2 environments on SNAP technical — filled TBD placeholders (dev/staging)',
    });
  }

  // Ensure production row when deployment target implies prod but matrix has no prod
  const hasProd = envMatrix.some((e) => /prod/.test(e.key) || /prod/.test(e.name));
  const strategy = String(technical.deployment?.strategy || '').toLowerCase();
  if (!hasProd && (strategy || technical.deployment?.target)) {
    envMatrix.push({
      key: 'production',
      name: 'Production',
      purpose: 'go-live',
      url: null,
      urlTbd: true,
      tbdReason: 'Inferred from deployment target — confirm URL at Gate2',
    });
  }

  return envMatrix;
}

function resolveReleaseMode(technical = {}) {
  const raw = String(technical.deployment?.strategy || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (/blue.?green/.test(raw)) return 'blue_green';
  if (/canary/.test(raw)) return 'canary';
  if (/rolling/.test(raw)) return 'rolling';
  if (/recreat|replace/.test(raw)) return 'recreate';
  if (raw) return raw.slice(0, 64);
  return 'checklist';
}

function buildRollbackSteps(mode) {
  const common = [
    'Stop promotion / freeze new deploys',
    'Restore previous known-good artifact or image tag',
    'Verify health checks on target env',
    'Communicate status to PM / on-call',
  ];
  if (mode === 'blue_green') {
    return [
      'Switch traffic back to previous color (blue/green)',
      ...common.slice(1),
    ];
  }
  if (mode === 'canary') {
    return [
      'Route 100% traffic away from canary revision',
      'Scale canary to zero',
      ...common.slice(1),
    ];
  }
  return common;
}

function phase4Checklist(envMatrix, mode) {
  return [
    {
      id: 'CHK-STAGING-SMOKE',
      title: 'Staging smoke / UAT evidence attached',
      env: envMatrix.find((e) => /stag|uat/.test(e.key))?.key || 'staging',
    },
    {
      id: 'CHK-ROLLBACK-READY',
      title: 'Rollback steps reviewed with owner',
      env: envMatrix.find((e) => /prod/.test(e.key))?.key || envMatrix.at(-1)?.key || 'production',
    },
    {
      id: 'CHK-RELEASE-MODE',
      title: `Release strategy confirmed (${mode})`,
      env: null,
    },
    {
      id: 'CHK-NO-INAPP-CI',
      title: 'CI/CD execute remains outside VoiceHub (checklist only)',
      env: null,
    },
  ];
}

/**
 * @param {object} container
 * @param {object} [toolData]
 * @returns {object}
 */
function runDeployPlanEngine(container = {}, toolData = {}) {
  const technical = pickTechnical(toolData, container);
  const openQuestions = [];
  const envMatrix = buildEnvMatrix(technical, openQuestions);

  const cicdSrc = technical.cicd && typeof technical.cicd === 'object' ? technical.cicd : {};
  const cicd = {
    provider: clip(cicdSrc.provider || '', 64) || null,
    pipelineUrl: clip(cicdSrc.pipelineUrl || '', 500) || null,
    notes: clip(cicdSrc.notes || '', 500) || null,
  };
  if (!cicd.provider) {
    openQuestions.push({
      id: 'Q-CICD-PROVIDER',
      topic: 'cicd',
      message: 'No CI/CD provider on SNAP — plan uses checklist mode; fill at Gate2',
    });
  }

  const mode = resolveReleaseMode(technical);
  const rollbackPlan = {
    steps: buildRollbackSteps(mode),
    ownerRole: 'devops_engineer',
    notes: clip(technical.deployment?.notes || '', 400) || null,
  };

  const schedulePlan =
    container?.planning?.schedulePlan && typeof container.planning.schedulePlan === 'object'
      ? container.planning.schedulePlan
      : null;
  const releases = asArray(schedulePlan?.releases);
  const goLiveEnd =
    releases.at(-1)?.estimatedEnd ||
    schedulePlan?.meta?.estimatedEnd ||
    container?.planning?.completion?.estimatedEnd ||
    null;

  const releaseStrategy = {
    mode,
    target: clip(technical.deployment?.target || '', 180) || null,
    notes:
      clip(technical.deployment?.notes || '', 400) ||
      'Plan-only artifact — execute deploy via external CI/ops checklist (Phase 4)',
    linkedReleaseId: releases.at(-1)?.id || null,
  };

  const deployPlan = {
    envMatrix,
    cicd,
    rollbackPlan,
    releaseStrategy,
    goLive: {
      estimatedEnd: goLiveEnd || null,
      deadlineConflict: Boolean(schedulePlan?.meta?.deadlineConflict),
    },
    phase4Checklist: phase4Checklist(envMatrix, mode),
    outOfScopeInApp: [...OUT_OF_SCOPE_IN_APP],
    assumptions: [
      'Deploy Plan is advisory for Gate2 — no in-app CI/CD runner',
      'Phase 4 closes via checklist + external evidence only',
    ],
    openQuestions,
    meta: {
      source: 'heuristic',
      llmCalls: 0,
      envCount: envMatrix.length,
      hasCicdProvider: Boolean(cicd.provider),
      releaseMode: mode,
      fromSnapEnvironments: asArray(technical.environments).length,
    },
  };

  return {
    status: 'ready',
    model: null,
    generatedAt: new Date().toISOString(),
    deployPlan,
    meta: deployPlan.meta,
  };
}

function applyDeployPlanToContainer(container, result) {
  const next = {
    ...container,
    planning: { ...(container?.planning || {}) },
  };
  next.planning.deployPlan = result?.deployPlan || null;
  return next;
}

function isDeployPlanStructurallyOk(deployPlan) {
  if (!deployPlan || typeof deployPlan !== 'object') return false;
  const envs = asArray(deployPlan.envMatrix);
  const envOk =
    envs.length >= 2 ||
    envs.some((e) => e && (e.urlTbd === true || String(e.tbdReason || '').trim()));
  const steps = asArray(deployPlan.rollbackPlan?.steps).filter((s) => String(s || '').trim());
  const mode = String(deployPlan.releaseStrategy?.mode || '').trim();
  const oos = asArray(deployPlan.outOfScopeInApp).map((x) => String(x || '').toLowerCase());
  const hasExecuteCiOos = oos.some(
    (x) => x.includes('execute_ci') || x.includes('deploy_production') || x.includes('cicd')
  );
  return Boolean(envOk && steps.length >= 1 && mode && hasExecuteCiOos);
}

/** Guard: plan must not carry executable CI action payloads. */
function assertDeployPlanIsPlanOnly(deployPlan) {
  if (!deployPlan || typeof deployPlan !== 'object') return true;
  if (deployPlan.execute === true || deployPlan.runCi === true) return false;
  if (Array.isArray(deployPlan.actions) && deployPlan.actions.length) return false;
  if (deployPlan.ciExecute && typeof deployPlan.ciExecute === 'object') return false;
  return true;
}

module.exports = {
  OUT_OF_SCOPE_IN_APP,
  runDeployPlanEngine,
  applyDeployPlanToContainer,
  isDeployPlanStructurallyOk,
  assertDeployPlanIsPlanOnly,
  buildEnvMatrix,
  resolveReleaseMode,
};
