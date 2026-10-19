/**
 * Per-section derive inputs — full semantic context (FR full + G4 + evidence + locale).
 * Avoid aggressive FR slim that drops description/AC.
 */

const { buildBgDeriveInput } = require('./buildBgDeriveInput');
const {
  buildSemanticDeriveContext,
  takeFrFull,
  takeBrqFull,
} = require('./buildSemanticDeriveContext');

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function clip(value, max = 160) {
  const t = String(value ?? '').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function overviewBits(pack) {
  const ov = pack?.overview && typeof pack.overview === 'object' ? pack.overview : {};
  return {
    projectName: clip(ov.requirementName || ov.projectName || ov.name, 120),
    objective: clip(ov.projectObjective || ov.problemStatement || ov.summary, 400),
    scope: clip(ov.businessScope || ov.scope, 400),
    constraint: clip(ov.constraint, 280),
    assumption: clip(ov.assumption, 280),
    platform: clip(ov.platform || ov.existingSystem, 120),
    existingSystem: clip(ov.existingSystem, 160),
    integration: clip(ov.integration, 200),
    expectedUsers: clip(ov.expectedUsers || ov.targetUsers, 200),
  };
}

function takeNfrRows(pack, max = 20) {
  return asArray(pack?.nonFunctionalRequirements)
    .slice(0, max)
    .map((r) => ({
      id: String(r.id || r.externalId || '').trim(),
      category: clip(r.category, 80),
      statement: clip(r.statement || r.description || r.name, 400),
      target: clip(r.target || r.metric || '', 120),
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
  return out.slice(0, 16);
}

function withSemantic(base, pack, opts) {
  const sem = buildSemanticDeriveContext(pack, opts);
  return {
    ...base,
    locale: sem.locale,
    languageInstruction: sem.languageInstruction,
    deriveInstruction: [base.deriveInstruction, sem.languageInstruction].filter(Boolean).join(' '),
    frFull: sem.frFull,
    brqFull: sem.brqFull,
    requirementUnderstanding: sem.requirementUnderstanding,
    evidenceRefs: sem.evidenceRefs,
    retrievedContext: sem.retrievedContext,
    // Keep frSlim alias as frFull for older prompt/quality paths that still read frSlim
    frSlim: sem.frFull,
    brqSlim: sem.brqFull,
  };
}

function buildBrDeriveInput(pack, opts = {}) {
  return withSemantic(
    {
      engineId: 'br',
      mode: 'raw_derive_v2',
      focus: 'business_rules',
      task: 'derive_business_rules',
      deriveInstruction:
        'Extract enforceable business rules from FR + requirementUnderstanding + BRQ + evidence. ' +
        'Include formulas when present in Input. Do not invent unrelated policies. ' +
        'JSON: rules[] with id, statement, sourceRefs. Max 10.',
      overview: overviewBits(pack),
    },
    pack,
    opts
  );
}

function buildUcDeriveInput(pack, opts = {}) {
  return withSemantic(
    {
      engineId: 'uc',
      mode: 'raw_derive_v2',
      focus: 'use_cases',
      task: 'derive_use_cases',
      deriveInstruction:
        'Propose use cases from FR behaviors + semantic capability/intent. ' +
        'JSON: useCases[] with id, name, primaryActor, goal, sourceRefs (FR ids). Max 8. No mainFlow. ' +
        'Prefer one UC per major behavior.',
      overview: overviewBits(pack),
    },
    pack,
    opts
  );
}

function buildBpmDeriveInput(pack, opts = {}) {
  return withSemantic(
    {
      engineId: 'bpm',
      mode: 'raw_derive_v2',
      focus: 'business_processes',
      task: 'derive_business_processes',
      deriveInstruction:
        'High-level processes by module from FR + semantic understanding. ' +
        'JSON: processes[] with id, name, steps (≤5 short strings), sourceRefs. Max 6.',
      overview: overviewBits(pack),
    },
    pack,
    opts
  );
}

function buildDataDeriveInput(pack, opts = {}) {
  const sem = buildSemanticDeriveContext(pack, opts);
  const ov = overviewBits(pack);
  const frForModules = takeFrFull(pack, opts, 32);
  return withSemantic(
    {
      engineId: 'data',
      mode: 'raw_derive_v2',
      focus: 'domain_entities',
      task: 'derive_domain_entities',
      deriveInstruction:
        'DOMAIN ENTITIES only (not actors/roles). Use FR description/AC + semantic capability. ' +
        'JSON: entities[] id,name,attributes,sourceRefs. Max 8.',
      projectContext: {
        projectName: ov.projectName,
        objective: ov.objective,
        scope: ov.scope,
      },
      modules: uniqueModules(frForModules),
      forbidNames: String(ov.expectedUsers || '')
        .split(/[,;/|]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 16),
    },
    pack,
    { ...opts, _sem: sem }
  );
}

function buildNfrDeriveInput(pack, opts = {}) {
  const ov = overviewBits(pack);
  return withSemantic(
    {
      engineId: 'nfr',
      mode: 'raw_derive_v2',
      focus: 'non_functional_requirements',
      task: 'derive_nfr_candidates',
      deriveInstruction:
        'NFR candidates (performance, security, availability, usability, compliance) from FR/BRQ/semantic. ' +
        'JSON: nfrs[] nfrId,category,statement,metric?,threshold?,sourceRefs. Max 8.',
      projectContext: {
        projectName: ov.projectName,
        objective: ov.objective,
        scope: ov.scope,
        platform: ov.platform,
      },
      nfrSlim: takeNfrRows(pack, 12),
    },
    pack,
    opts
  );
}

function buildScopeDeriveInput(pack, opts = {}) {
  const ov = overviewBits(pack);
  return withSemantic(
    {
      engineId: 'scope',
      mode: 'raw_derive_v2',
      focus: 'scope_in_out',
      task: 'derive_scope_items',
      deriveInstruction:
        'Scope IN vs OUT from overview/BRQ/FR/semantic. Do not expand beyond source. ' +
        'JSON: scopeItems[] scopeId,inOut(in|out),statement,rationale?,sourceRefs. Max 10.',
      projectContext: {
        projectName: ov.projectName,
        objective: ov.objective,
        scope: ov.scope,
      },
    },
    pack,
    opts
  );
}

/**
 * Actors — LLM when deterministic extract empty; grounded on FR.actor + semantic actors + expectedUsers.
 */
function buildActorsDeriveInput(pack, opts = {}) {
  const ov = overviewBits(pack);
  const fr = takeFrFull(pack, opts, 40);
  const actorsFromFr = [];
  const seen = new Set();
  for (const row of fr) {
    const a = String(row.actor || '').trim();
    if (!a) continue;
    const key = a.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    actorsFromFr.push({ name: a, relatedFrIds: row.id ? [row.id] : [] });
  }
  return withSemantic(
    {
      engineId: 'actors',
      mode: 'raw_derive_v2',
      focus: 'actors',
      task: 'derive_actors',
      deriveInstruction:
        'Propose distinct human/system actors from FR.actor fields, requirementUnderstanding.actors, ' +
        'expectedUsers, and BRQ stakeholders. Do not invent unrelated roles. ' +
        'JSON: actors[] with id, name, type(human|system), relatedFrIds, sourceRefs. Max 10.',
      overview: ov,
      actorSignals: actorsFromFr,
      expectedUsers: ov.expectedUsers,
    },
    pack,
    opts
  );
}

/**
 * @param {string} engineId
 * @param {object} pack
 * @param {object} [opts]
 */
function buildDeriveInputForSection(engineId, pack, opts = {}) {
  const id = String(engineId || '').toLowerCase();
  if (id === 'bg') {
    // BG keeps its own slim V2 contract — do not attach frFull (would duplicate requirements[]).
    const base = buildBgDeriveInput(pack, opts);
    const sem = buildSemanticDeriveContext(pack, opts);
    return {
      ...base,
      locale: sem.locale,
      languageInstruction: sem.languageInstruction,
      deriveInstruction: [base.deriveInstruction, sem.languageInstruction].filter(Boolean).join(' '),
      requirementUnderstanding: sem.requirementUnderstanding || undefined,
      retrievedContext: sem.retrievedContext,
    };
  }
  if (id === 'br') return buildBrDeriveInput(pack, opts);
  if (id === 'uc') return buildUcDeriveInput(pack, opts);
  if (id === 'bpm') return buildBpmDeriveInput(pack, opts);
  if (id === 'data') return buildDataDeriveInput(pack, opts);
  if (id === 'nfr') return buildNfrDeriveInput(pack, opts);
  if (id === 'scope') return buildScopeDeriveInput(pack, opts);
  if (id === 'actors') return buildActorsDeriveInput(pack, opts);
  const sem = buildSemanticDeriveContext(pack, opts);
  return {
    engineId: id,
    mode: 'raw_derive_v2',
    overview: overviewBits(pack),
    ...sem,
    frSlim: sem.frFull,
    brqSlim: sem.brqFull,
  };
}

module.exports = {
  buildDeriveInputForSection,
  buildBrDeriveInput,
  buildUcDeriveInput,
  buildBpmDeriveInput,
  buildDataDeriveInput,
  buildNfrDeriveInput,
  buildScopeDeriveInput,
  buildActorsDeriveInput,
  takeFrFull,
  takeBrqFull,
};
