/**
 * Pure helpers — G2 Technical Setup (không phụ thuộc DB).
 */

const ENV_KEYS = Object.freeze(['dev', 'staging', 'prod', 'custom']);

function trimStr(raw, max) {
  const s = String(raw ?? '').trim();
  return s.length > max ? s.slice(0, max) : s;
}

function asStringList(raw, maxItems = 24, maxLen = 64) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    const s = trimStr(item, maxLen);
    if (s) out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
}

function emptyTechnicalSetup() {
  return {
    repository: { url: '', provider: '', defaultBranch: '' },
    stack: { languages: [], frameworks: [], databases: [] },
    environments: [],
    infrastructure: { notes: '', cloudProvider: '' },
    cicd: { provider: '', pipelineUrl: '', notes: '' },
    deployment: { strategy: '', target: '', notes: '' },
    completedAt: null,
    updatedBy: null,
  };
}

/**
 * Merge partial body into existing technicalSetup document shape.
 * @returns {{ ok: true, setup: object } | { ok: false, message: string }}
 */
function mergeTechnicalSetup(existing = {}, body = {}) {
  const base = {
    ...emptyTechnicalSetup(),
    ...(existing && typeof existing === 'object' ? existing : {}),
  };
  const patch = body && typeof body === 'object' ? body : {};

  if (patch.repository !== undefined) {
    if (patch.repository === null || typeof patch.repository !== 'object') {
      return { ok: false, message: 'repository không hợp lệ' };
    }
    const r = patch.repository;
    base.repository = {
      url: r.url !== undefined ? trimStr(r.url, 500) : base.repository?.url || '',
      provider: r.provider !== undefined ? trimStr(r.provider, 64) : base.repository?.provider || '',
      defaultBranch:
        r.defaultBranch !== undefined
          ? trimStr(r.defaultBranch, 128)
          : base.repository?.defaultBranch || '',
    };
  }

  if (patch.stack !== undefined) {
    if (patch.stack === null || typeof patch.stack !== 'object') {
      return { ok: false, message: 'stack không hợp lệ' };
    }
    const s = patch.stack;
    base.stack = {
      languages:
        s.languages !== undefined ? asStringList(s.languages) : base.stack?.languages || [],
      frameworks:
        s.frameworks !== undefined ? asStringList(s.frameworks) : base.stack?.frameworks || [],
      databases:
        s.databases !== undefined ? asStringList(s.databases) : base.stack?.databases || [],
    };
  }

  if (patch.environments !== undefined) {
    if (!Array.isArray(patch.environments)) {
      return { ok: false, message: 'environments phải là mảng' };
    }
    const envs = [];
    for (const row of patch.environments.slice(0, 12)) {
      if (!row || typeof row !== 'object') continue;
      let key = trimStr(row.key || 'custom', 32).toLowerCase() || 'custom';
      if (!ENV_KEYS.includes(key)) key = 'custom';
      envs.push({
        key,
        name: trimStr(row.name || key, 120),
        url: trimStr(row.url || '', 500),
      });
    }
    base.environments = envs;
  }

  if (patch.infrastructure !== undefined) {
    if (patch.infrastructure === null || typeof patch.infrastructure !== 'object') {
      return { ok: false, message: 'infrastructure không hợp lệ' };
    }
    const i = patch.infrastructure;
    base.infrastructure = {
      notes: i.notes !== undefined ? trimStr(i.notes, 2000) : base.infrastructure?.notes || '',
      cloudProvider:
        i.cloudProvider !== undefined
          ? trimStr(i.cloudProvider, 64)
          : base.infrastructure?.cloudProvider || '',
    };
  }

  if (patch.cicd !== undefined) {
    if (patch.cicd === null || typeof patch.cicd !== 'object') {
      return { ok: false, message: 'cicd không hợp lệ' };
    }
    const c = patch.cicd;
    base.cicd = {
      provider: c.provider !== undefined ? trimStr(c.provider, 64) : base.cicd?.provider || '',
      pipelineUrl:
        c.pipelineUrl !== undefined ? trimStr(c.pipelineUrl, 500) : base.cicd?.pipelineUrl || '',
      notes: c.notes !== undefined ? trimStr(c.notes, 2000) : base.cicd?.notes || '',
    };
  }

  if (patch.deployment !== undefined) {
    if (patch.deployment === null || typeof patch.deployment !== 'object') {
      return { ok: false, message: 'deployment không hợp lệ' };
    }
    const d = patch.deployment;
    base.deployment = {
      strategy: d.strategy !== undefined ? trimStr(d.strategy, 64) : base.deployment?.strategy || '',
      target: d.target !== undefined ? trimStr(d.target, 180) : base.deployment?.target || '',
      notes: d.notes !== undefined ? trimStr(d.notes, 2000) : base.deployment?.notes || '',
    };
  }

  return { ok: true, setup: base };
}

/**
 * Minimum complete: repository.url + ≥1 environment.
 */
function isTechnicalSetupComplete(setup) {
  const s = setup && typeof setup === 'object' ? setup : {};
  const url = String(s.repository?.url || '').trim();
  const envs = Array.isArray(s.environments) ? s.environments : [];
  return Boolean(url) && envs.length > 0;
}

module.exports = {
  ENV_KEYS,
  emptyTechnicalSetup,
  mergeTechnicalSetup,
  isTechnicalSetupComplete,
};
