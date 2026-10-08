/**
 * Slim V2 derive inputs per section (same process as BG; section-specific payload).
 * Avoid dumping full AC / requirementUnderstanding / huge schema — 3B + time budget.
 */

const { buildBgDeriveInput } = require('./buildBgDeriveInput');
const { INTEGRATION_RE } = require('./sectionDeriveQuality');

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function clip(value, max = 160) {
  const t = String(value ?? '').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function frId(row) {
  return String(row?.externalId || row?.logicalId || row?.id || row?.frId || '').trim();
}

function takeFrSlim(pack, opts = {}, max = 40) {
  const fromProposal = asArray(opts.proposal?.generated?.functionalRequirements?.items).map((row) => ({
    id: String(row.logicalId || row.id || '').trim(),
    name: clip(row.title || row.name, 120),
    module: clip(row.module || row.moduleLabel, 80),
    actor: clip(row.actor || row.primaryActor, 60),
  }));
  const fromPack = asArray(pack?.functionalRequirements).map((row) => ({
    id: frId(row),
    name: clip(row.name || row.title, 120),
    module: clip(
      row.module || row.moduleLabel || row.feature || row.functional_scope || row.functionalScope || row.area,
      80
    ),
    actor: clip(row.actor || row.primaryActor || row.userActor, 60),
  }));
  const out = [];
  const seen = new Set();
  for (const row of [...fromProposal, ...fromPack]) {
    if (!row.id && !row.name) continue;
    const key = row.id || row.name;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
    if (out.length >= max) break;
  }
  return out;
}

function takeBrqSlim(pack, opts = {}, max = 40) {
  const canonical = opts.snapshot?.canonicalRaw || pack?.aiAnalysis?.canonicalRaw || null;
  let rows = [];
  if (canonical?.sections) {
    const sec = canonical.sections.businessRequests || canonical.sections.business_requests;
    rows = asArray(sec?.rows || sec);
  }
  if (!rows.length) {
    rows = asArray(pack?.aiAnalysis?.customerRawRows?.businessRequests);
  }
  return rows
    .slice(0, max)
    .map((r) => ({
      id: String(r.requestId || r.id || r.externalId || '').trim(),
      statement: clip(r.statement || r.description || r.businessGoal || r.title || r.name, 200),
      category: clip(r.category || r.priority, 40),
    }))
    .filter((r) => r.id || r.statement);
}

function takeNfrSlim(pack, max = 20) {
  return asArray(pack?.nonFunctionalRequirements)
    .slice(0, max)
    .map((r) => ({
      id: String(r.id || r.externalId || '').trim(),
      category: clip(r.category, 40),
      statement: clip(r.statement || r.description || r.name, 160),
    }))
    .filter((r) => r.id || r.statement);
}

function overviewBits(pack) {
  const ov = pack?.overview && typeof pack.overview === 'object' ? pack.overview : {};
  return {
    projectName: clip(ov.requirementName || ov.projectName || ov.name, 120),
    objective: clip(ov.projectObjective || ov.problemStatement || ov.summary, 280),
    scope: clip(ov.businessScope || ov.scope, 280),
    constraint: clip(ov.constraint, 200),
    assumption: clip(ov.assumption, 200),
    platform: clip(ov.platform || ov.existingSystem, 120),
    existingSystem: clip(ov.existingSystem, 120),
    integration: clip(ov.integration, 160),
    expectedUsers: clip(ov.expectedUsers || ov.targetUsers, 160),
  };
}

function buildBrDeriveInput(pack, opts = {}) {
  return {
    engineId: 'br',
    mode: 'raw_derive_v2',
    focus: 'business_rules',
    task: 'derive_business_rules',
    deriveInstruction:
      'Extract enforceable business rules. JSON: rules[] with id, statement, sourceRefs. Max 6 short rules.',
    overview: overviewBits(pack),
    frSlim: takeFrSlim(pack, opts, 14),
    brqSlim: takeBrqSlim(pack, opts, 8),
  };
}

function buildUcDeriveInput(pack, opts = {}) {
  return {
    engineId: 'uc',
    mode: 'raw_derive_v2',
    focus: 'use_cases',
    task: 'derive_use_cases',
    deriveInstruction:
      'Propose use cases. JSON: useCases[] with id, name, primaryActor, goal, sourceRefs. Max 5. No mainFlow.',
    overview: overviewBits(pack),
    frSlim: takeFrSlim(pack, opts, 16),
  };
}

function buildBpmDeriveInput(pack, opts = {}) {
  return {
    engineId: 'bpm',
    mode: 'raw_derive_v2',
    focus: 'business_processes',
    task: 'derive_business_processes',
    deriveInstruction:
      'High-level processes by module. JSON: processes[] with id, name, steps (≤4 short strings), sourceRefs. Max 4.',
    overview: overviewBits(pack),
    frSlim: takeFrSlim(pack, opts, 14),
  };
}

/** Data derive: modules + FR nouns only — omit actor (3B copies roles as entities). */
function takeFrForData(pack, opts = {}, max = 24) {
  return takeFrSlim(pack, opts, max).map((r) => ({
    id: r.id,
    name: r.name,
    module: r.module,
  }));
}

function uniqueModules(frRows) {
  const out = [];
  const seen = new Set();
  for (const r of frRows) {
    const m = String(r.module || '').trim();
    if (!m) continue;
    const key = m.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out.slice(0, 12);
}

function takeFrForInterface(pack, opts = {}, max = 14) {
  const all = takeFrSlim(pack, opts, 60).map((r) => ({
    id: r.id,
    name: r.name,
    module: r.module,
  }));
  const hit = all.filter((r) => INTEGRATION_RE.test(`${r.name} ${r.module}`));
  const picked = hit.length ? hit : all.filter((r) => /file|email|excel|csv|api|export|import|thông báo|đính kèm/i.test(r.name));
  return (picked.length ? picked : all.slice(0, 8)).slice(0, max);
}

function buildDataDeriveInput(pack, opts = {}) {
  const frSlim = takeFrForData(pack, opts, 16);
  const ov = overviewBits(pack);
  return {
    engineId: 'data',
    mode: 'raw_derive_v2',
    focus: 'domain_entities',
    task: 'derive_domain_entities',
    deriveInstruction:
      'DOMAIN ENTITIES only (not actors). Examples: Employee, Department, LeaveRequest. ' +
      'JSON: entities[] id,name,attributes,sourceRefs. Max 6.',
    projectContext: {
      projectName: ov.projectName,
      objective: ov.objective,
      scope: ov.scope,
    },
    modules: uniqueModules(frSlim),
    frSlim,
    forbidNames: String(ov.expectedUsers || '')
      .split(/[,;/|]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 12),
  };
}

function buildInterfaceDeriveInput(pack, opts = {}) {
  const ov = overviewBits(pack);
  const frSlim = takeFrForInterface(pack, opts, 10);
  const nfrSlim = takeNfrSlim(pack, 6);
  return {
    engineId: 'interface',
    mode: 'raw_derive_v2',
    focus: 'external_interfaces',
    task: 'derive_external_interfaces',
    deriveInstruction:
      'EXTERNAL systems only (not FR titles). Examples: Email gateway, Excel/CSV import, File storage, SSO. ' +
      'JSON: interfaces[] id,name,protocol,direction,sourceRefs. Max 4.',
    projectContext: {
      projectName: ov.projectName,
      platform: ov.platform,
      existingSystem: ov.existingSystem,
      integration: ov.integration || 'Infer from FR signals (email, file, Excel/CSV, API).',
    },
    integrationSignals: frSlim,
    nfrSlim,
  };
}

/**
 * @param {string} engineId
 * @param {object} pack
 * @param {object} [opts]
 */
function buildDeriveInputForSection(engineId, pack, opts = {}) {
  const id = String(engineId || '').toLowerCase();
  if (id === 'bg') return buildBgDeriveInput(pack, opts);
  if (id === 'br') return buildBrDeriveInput(pack, opts);
  if (id === 'uc') return buildUcDeriveInput(pack, opts);
  if (id === 'bpm') return buildBpmDeriveInput(pack, opts);
  if (id === 'data') return buildDataDeriveInput(pack, opts);
  if (id === 'interface') return buildInterfaceDeriveInput(pack, opts);
  return {
    engineId: id,
    mode: 'raw_derive_v2',
    overview: overviewBits(pack),
    frSlim: takeFrSlim(pack, opts, 20),
  };
}

module.exports = {
  buildDeriveInputForSection,
  buildBrDeriveInput,
  buildUcDeriveInput,
  buildBpmDeriveInput,
  buildDataDeriveInput,
  buildInterfaceDeriveInput,
};
