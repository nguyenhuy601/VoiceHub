/**
 * Build per-section input slices from Customer Raw pack for LLM/deterministic derive.
 * Caps rows to keep prompts bounded.
 * Prefer Raw + normalized FR + Requirement Understanding + evidence (not Raw→LLM alone).
 * BG uses dedicated V2 contract (buildBgDeriveInput) — not the shared raw dump.
 */

const { buildBgDeriveInput, profileBgDeriveInput } = require('./buildBgDeriveInput');

const FR_CAP = 40;
const BRQ_CAP = 20;
const NFR_CAP = 20;
const UNDERSTANDING_FR_CAP = 30;
const EVIDENCE_CAP = 40;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function clipText(value, max = 400) {
  const text = String(value ?? '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

function frId(row) {
  return String(row?.externalId || row?.logicalId || row?.id || row?.frId || '').trim();
}

function slimFr(row) {
  return {
    id: frId(row),
    name: clipText(row?.name || row?.title || row?.requirement || '', 240),
    description: clipText(row?.description || '', 320),
    module: clipText(row?.moduleLabel || row?.module || '', 80),
    actor: clipText(row?.actor || row?.userActor || '', 80),
    acceptanceCriteria: clipText(row?.acceptanceCriteria || row?.acceptance || '', 240),
    priority: clipText(row?.priority || '', 40),
    requestId: clipText(row?.requestId || row?.businessRequestId || '', 40),
  };
}

function slimBrq(row) {
  return {
    id: String(row?.requestId || row?.id || row?.externalId || '').trim(),
    title: clipText(row?.title || row?.requestTitle || '', 160),
    statement: clipText(row?.customerStatement || row?.statement || row?.description || '', 320),
    businessProblem: clipText(row?.businessProblem || '', 200),
    businessGoal: clipText(row?.businessGoal || row?.goal || '', 200),
    expectedBenefit: clipText(row?.expectedBenefit || row?.benefit || '', 160),
    priority: clipText(row?.priority || '', 40),
    stakeholder: clipText(row?.stakeholder || '', 80),
  };
}

function slimNfr(row) {
  return {
    id: String(row?.externalId || row?.nfrId || row?.id || '').trim(),
    category: clipText(row?.category || '', 80),
    statement: clipText(row?.name || row?.title || row?.customerRequirement || row?.description || '', 240),
    target: clipText(row?.target || row?.metric || '', 120),
    priority: clipText(row?.priority || '', 40),
  };
}

function overviewSlice(pack) {
  const o = pack?.overview || {};
  return {
    projectName: clipText(o.requirementName || o.projectName || '', 120),
    projectObjective: clipText(o.projectObjective || '', 280),
    businessScope: clipText(o.businessScope || '', 280),
    businessProblem: clipText(o.businessProblem || '', 200),
    expectedUsers: clipText(o.expectedUsers || o.targetUsers || '', 160),
    platform: clipText(o.platform || o.targetPlatform || '', 80),
    existingSystem: clipText(o.existingSystem || '', 120),
    integration: clipText(o.integration || '', 160),
    constraint: clipText(o.constraint || '', 200),
    assumption: clipText(o.assumption || '', 200),
    expectedOutcome: clipText(o.expectedOutcome || '', 200),
  };
}

function scopeSlice(pack) {
  return asArray(pack?.scope).slice(0, 20).map((row, i) => ({
    id: String(row?.id || row?.logicalId || `SCOPE-${i + 1}`),
    inOut: row?.scopeType || row?.type || (row?.inScope === false ? 'out' : 'in'),
    description: clipText(row?.description || row?.statement || '', 280),
  }));
}

function slimRequirementUnderstanding(g4) {
  if (!g4 || typeof g4 !== 'object') return null;
  const requirements = asArray(g4.requirements)
    .slice(0, UNDERSTANDING_FR_CAP)
    .map((r) => ({
      id: String(r.id || r.frId || r.logicalId || '').trim(),
      title: clipText(r.title || r.name || '', 160),
      actors: asArray(r.actors || r.actor)
        .map(String)
        .slice(0, 4),
      intent: clipText(r.semanticInterpretation?.intent || r.intent || '', 120),
      capability: clipText(r.semanticInterpretation?.capability || r.capability || '', 120),
    }))
    .filter((r) => r.id || r.title);

  const semanticItems = asArray(g4.semanticItems)
    .slice(0, UNDERSTANDING_FR_CAP)
    .map((item) => ({
      frId: String(item.frId || '').trim(),
      capability: clipText(item.semanticInterpretation?.capability || '', 120),
      intent: clipText(item.semanticInterpretation?.intent || '', 120),
      ambiguities: asArray(item.ambiguities)
        .slice(0, 3)
        .map((a) => ({
          field: clipText(a.field || '', 40),
          issue: clipText(a.issue || '', 120),
        })),
    }))
    .filter((r) => r.frId);

  const facts = g4.facts && typeof g4.facts === 'object' ? g4.facts : {};
  return {
    requirementCount: requirements.length || asArray(g4.requirements).length,
    requirements: requirements.length ? requirements : undefined,
    semanticItems: semanticItems.length ? semanticItems : undefined,
    factKeys: Object.keys(facts).slice(0, 20),
    ambiguityCount: asArray(g4.ambiguities).length,
    conflictCount: asArray(g4.conflicts).length,
  };
}

function slimEvidenceRefs(evidence) {
  return asArray(evidence)
    .slice(0, EVIDENCE_CAP)
    .map((ev, i) => ({
      id: String(ev.id || ev.sourceId || ev.frId || `EV-${i + 1}`).trim(),
      type: clipText(ev.type || ev.sourceType || '', 40),
      frId: clipText(ev.frId || '', 40),
      source: clipText(ev.source || ev.calculatedBy || '', 60),
      metric: clipText(ev.metric || '', 60),
      value: clipText(ev.value || ev.field || '', 120),
    }));
}

function mergeFrSources(pack, opts) {
  const fromPack = asArray(pack?.functionalRequirements).map(slimFr).filter((r) => r.id || r.name);
  const fromProposal = asArray(opts.proposal?.generated?.functionalRequirements?.items).map((row) =>
    slimFr({
      externalId: row.logicalId || row.id,
      name: row.title || row.name,
      description: row.description,
      actor: row.actor,
      acceptanceCriteria: row.acceptanceCriteria,
    })
  );
  const byId = new Map();
  for (const row of [...fromProposal, ...fromPack]) {
    const key = row.id || row.name;
    if (!key || byId.has(key)) continue;
    byId.set(key, row);
  }
  return [...byId.values()];
}

/**
 * @param {string} engineId
 * @param {object} pack
 * @param {{ proposal?: object, g4Understanding?: object, evidence?: object[] }} [opts]
 */
function buildRawDeriveInput(engineId, pack, opts = {}) {
  const id = String(engineId || '');
  const frAll = mergeFrSources(pack, opts);
  const brqAll = asArray(pack?.aiAnalysis?.customerRawRows?.businessRequests)
    .map(slimBrq)
    .filter((r) => r.id || r.title || r.businessGoal);
  const nfrAll = asArray(pack?.nonFunctionalRequirements).map(slimNfr);
  const refs = asArray(pack?.aiAnalysis?.customerRawRows?.references)
    .slice(0, 12)
    .map((row) => ({
      id: String(row?.referenceId || row?.id || '').trim(),
      name: clipText(row?.name || '', 120),
      type: clipText(row?.type || '', 40),
      relatedRequirement: clipText(row?.relatedRequirement || '', 80),
    }));

  const overview = overviewSlice(pack);
  const scope = scopeSlice(pack);
  const g4 = opts.g4Understanding || opts.understanding || null;
  const requirementUnderstanding = slimRequirementUnderstanding(g4);
  const evidenceRefs = slimEvidenceRefs(opts.evidence || g4?.evidence || null);

  const base = {
    engineId: id,
    mode: 'raw_derive',
    overview,
    scope,
    functionalRequirements: frAll.slice(0, FR_CAP),
    nonFunctionalRequirements: nfrAll.slice(0, NFR_CAP),
    businessRequests: brqAll.slice(0, BRQ_CAP),
    references: refs,
    targetUsers: overview.expectedUsers,
    requirementUnderstanding,
    evidenceRefs,
    deriveInstruction:
      'Project Analysis candidates ONLY from functionalRequirements + requirementUnderstanding + evidenceRefs + overview. Do not invent features without source ids.',
  };

  if (id === 'bg') {
    return buildBgDeriveInput(pack, opts);
  }
  if (id === 'br') {
    return {
      ...base,
      focus: 'business_rules',
      overview: {
        constraint: overview.constraint,
        assumption: overview.assumption,
        businessScope: overview.businessScope,
      },
    };
  }
  if (id === 'bpm') {
    return {
      ...base,
      focus: 'business_processes',
      businessRequests: brqAll.slice(0, BRQ_CAP),
    };
  }
  if (id === 'uc') {
    return {
      ...base,
      focus: 'use_cases',
      targetUsers: overview.expectedUsers,
      businessRequests: brqAll.slice(0, BRQ_CAP),
    };
  }
  if (id === 'data') {
    return {
      ...base,
      focus: 'domain_entities',
      overview: {
        businessDomain: overview.businessScope,
        projectName: overview.projectName,
      },
      businessRequests: brqAll.slice(0, 8),
    };
  }
  if (id === 'interface') {
    return {
      ...base,
      focus: 'external_interfaces',
      overview: {
        platform: overview.platform,
        existingSystem: overview.existingSystem,
        integration: overview.integration,
      },
      functionalRequirements: frAll
        .filter((r) => /api|sso|integrat|email|sms|payment|external/i.test(`${r.name} ${r.description}`))
        .slice(0, 20)
        .concat(frAll.slice(0, 10))
        .filter((row, index, arr) => arr.findIndex((x) => x.id === row.id) === index)
        .slice(0, FR_CAP),
      nonFunctionalRequirements: nfrAll.slice(0, NFR_CAP),
    };
  }
  if (id === 'actors') {
    return {
      ...base,
      focus: 'actors',
      functionalRequirements: frAll.map((r) => ({ id: r.id, actor: r.actor, module: r.module })),
      targetUsers: overview.expectedUsers,
    };
  }
  if (id === 'scope') {
    return {
      ...base,
      focus: 'scope',
      overview: {
        businessScope: overview.businessScope,
        projectObjective: overview.projectObjective,
      },
      scope,
      functionalRequirements: [],
      nonFunctionalRequirements: [],
      businessRequests: brqAll.slice(0, 8),
    };
  }

  return base;
}

module.exports = {
  FR_CAP,
  BRQ_CAP,
  NFR_CAP,
  buildRawDeriveInput,
  slimFr,
  slimBrq,
  overviewSlice,
  slimRequirementUnderstanding,
  slimEvidenceRefs,
  buildBgDeriveInput,
  profileBgDeriveInput,
};
