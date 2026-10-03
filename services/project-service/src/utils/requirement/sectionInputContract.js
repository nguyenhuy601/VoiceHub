/**
 * Section Input Contract — whitelist semantics per section from canonicalRaw.
 * RULE-SC: engines consume this, not raw workbook / README.
 */

const SECTION_WHITELISTS = Object.freeze({
  fr: Object.freeze([
    'requirement_identity',
    'business_request_reference',
    'functional_behavior',
    'requirement_type',
    'functional_scope',
    'actor',
    'priority',
    'acceptance_condition',
    'customer_constraint_or_note',
  ]),
  nfr: Object.freeze([
    'nfr_identity',
    'quality_attribute',
    'quality_requirement',
    'quality_target',
    'priority',
  ]),
  bg: Object.freeze([
    'business_objective',
    'business_problem',
    'business_goal',
    'business_benefit',
    'scope',
    'scope_in',
    'scope_out',
    'business_domain',
    'business_outcome',
    'customer_statement',
    'business_request_identity',
    'business_request_title',
  ]),
  scope: Object.freeze(['scope', 'scope_in', 'scope_out', 'business_scope']),
});

const REQUIRED_BY_SECTION = Object.freeze({
  fr: ['functional_behavior'],
  nfr: ['quality_requirement'],
  bg: [], // soft — incomplete if no goals/problems/objectives
  scope: [],
});

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

/** First non-empty text from array or bare string (canonical content scalars). */
function firstText(v) {
  if (Array.isArray(v)) {
    for (const item of v) {
      const t = String(item ?? '').trim();
      if (t) return t;
    }
    return null;
  }
  if (v == null) return null;
  const t = String(v).trim();
  return t || null;
}

/**
 * @param {'fr'|'nfr'|'bg'|'scope'} sectionId
 * @param {object|null|undefined} canonicalRaw
 */
function buildSectionInput(sectionId, canonicalRaw) {
  const id = String(sectionId || '').trim().toLowerCase();
  const whitelist = SECTION_WHITELISTS[id];
  if (!whitelist) {
    return {
      sectionId: id,
      ok: false,
      incomplete: true,
      missing: ['unknown_section'],
      items: [],
      scalars: {},
      provenanceRefs: [],
    };
  }

  if (!canonicalRaw || typeof canonicalRaw !== 'object') {
    return {
      sectionId: id,
      ok: false,
      incomplete: true,
      missing: ['canonical_raw'],
      items: [],
      scalars: {},
      provenanceRefs: [],
      legacy: true,
    };
  }

  if (id === 'fr') {
    const items = asArray(canonicalRaw.content?.functionalBehaviors).map((row) => {
      const out = {};
      for (const key of whitelist) {
        if (key === 'requirement_identity') out[key] = row.id || row.requirement_identity;
        else if (key === 'acceptance_condition') {
          out[key] = row.acceptance_condition || '';
        } else if (key === 'customer_constraint_or_note') {
          out[key] = row.customer_constraint_or_note || '';
        } else if (row[key] != null) out[key] = row[key];
      }
      out.provenance = row.provenance || {};
      return out;
    });
    const missing = [];
    if (!items.length) missing.push('functional_behavior');
    const withBehavior = items.filter((i) => i.functional_behavior);
    return {
      sectionId: id,
      ok: withBehavior.length > 0,
      incomplete: withBehavior.length === 0,
      missing,
      items: withBehavior,
      scalars: {},
      provenanceRefs: asArray(canonicalRaw.provenance?.requirementEvidence),
      registryVersion: canonicalRaw.registryVersion || null,
    };
  }

  if (id === 'nfr') {
    const items = asArray(canonicalRaw.content?.qualityRequirements).map((row) => {
      const out = {};
      for (const key of whitelist) {
        if (key === 'nfr_identity') out[key] = row.id || row.nfr_identity;
        else if (row[key] != null) out[key] = row[key];
      }
      out.provenance = row.provenance || {};
      return out;
    });
    return {
      sectionId: id,
      ok: items.length > 0,
      incomplete: items.length === 0,
      missing: items.length ? [] : ['quality_requirement'],
      items,
      scalars: {},
      // Context constraints must NOT appear as NFR items (RULE-SC-05)
      impliedContext: {
        platform_constraint: canonicalRaw.constraints?.platform_constraint || null,
        business_constraint: canonicalRaw.constraints?.business_constraint || null,
      },
      provenanceRefs: [],
      registryVersion: canonicalRaw.registryVersion || null,
    };
  }

  if (id === 'bg') {
    const scalars = {
      business_objective: firstText(canonicalRaw.content?.businessObjectives),
      business_domain: firstText(canonicalRaw.content?.businessDomains),
      business_outcome: firstText(canonicalRaw.content?.businessOutcomes),
      scope: firstText(canonicalRaw.content?.scopes),
      scope_in: firstText(canonicalRaw.content?.scopeIn),
      scope_out: firstText(canonicalRaw.content?.scopeOut),
    };
    const items = asArray(canonicalRaw.records?.businessRequests).map((brq) => ({
      business_request_identity: brq.business_request_identity,
      business_request_title: brq.business_request_title || brq.content?.business_request_title,
      customer_statement: brq.customer_statement,
      business_problem: brq.business_problem,
      business_goal: brq.business_goal,
      business_benefit: brq.business_benefit,
      priority: brq.classification?.priority || null,
      stakeholder: brq.stakeholder || brq.context?.stakeholder || null,
    }));
    // Also expose aggregated content lists
    const problems = asArray(canonicalRaw.content?.businessProblems);
    const goals = asArray(canonicalRaw.content?.businessGoals);
    const incomplete = !scalars.business_objective && !goals.length && !problems.length && !items.length;
    return {
      sectionId: id,
      ok: !incomplete,
      incomplete,
      missing: incomplete ? ['business_goal_or_problem_or_objective'] : [],
      items,
      scalars,
      lists: {
        business_problems: problems,
        business_goals: goals,
        business_benefits: asArray(canonicalRaw.content?.businessBenefits),
        customer_statements: asArray(canonicalRaw.content?.customerStatements),
      },
      provenanceRefs: [],
      registryVersion: canonicalRaw.registryVersion || null,
    };
  }

  // scope
  const scalars = {
    scope: firstText(canonicalRaw.content?.scopes),
    scope_in: firstText(canonicalRaw.content?.scopeIn),
    scope_out: firstText(canonicalRaw.content?.scopeOut),
  };
  const items = [];
  if (scalars.scope_in) items.push({ type: 'in', description: scalars.scope_in });
  if (scalars.scope_out) items.push({ type: 'out', description: scalars.scope_out });
  if (!items.length && scalars.scope) {
    items.push({ type: 'in', description: scalars.scope });
  }
  return {
    sectionId: id,
    ok: items.length > 0,
    incomplete: items.length === 0,
    missing: items.length ? [] : ['scope'],
    items,
    scalars,
    provenanceRefs: [],
    registryVersion: canonicalRaw.registryVersion || null,
  };
}

/**
 * Map FR section input → pack-shaped functionalRequirements (dual-read bridge).
 */
function frSectionToPackRows(sectionInput) {
  return asArray(sectionInput?.items).map((row) => {
    const behavior = String(row.functional_behavior || '').trim();
    const priority = String(row.priority || 'Medium').trim().slice(0, 32) || 'Medium';
    return {
      externalId: String(row.requirement_identity || '').trim().slice(0, 64),
      id: String(row.requirement_identity || '').trim().slice(0, 64),
      // Customer Raw FR rows are leaf requirements (align workbookFrExtract)
      level: 'Requirement',
      parentExternalId: '',
      name: behavior.slice(0, 500),
      description: behavior.slice(0, 4000),
      moduleLabel: String(row.functional_scope || '').trim().slice(0, 240),
      actor: String(row.actor || '').trim().slice(0, 240),
      priority,
      // Pack schema: acceptanceCriteria is String (not array)
      acceptanceCriteria: row.acceptance_condition
        ? String(row.acceptance_condition).slice(0, 4000)
        : '',
      requestId: String(row.business_request_reference || '').trim().slice(0, 64),
      requirementType: String(row.requirement_type || '').trim().slice(0, 64),
      customerNotes: String(row.customer_constraint_or_note || '').trim().slice(0, 2000),
    };
  });
}

/**
 * Map NFR section input → pack-shaped NFR rows (keep quality_* split).
 */
function nfrSectionToPackRows(sectionInput) {
  return asArray(sectionInput?.items).map((row) => ({
    externalId: row.nfr_identity,
    category: row.quality_attribute || '',
    requirement: row.quality_requirement || '',
    target: row.quality_target || '',
    priority: row.priority || 'Medium',
    source: row.provenance?.source_type || '',
  }));
}

module.exports = {
  SECTION_WHITELISTS,
  REQUIRED_BY_SECTION,
  buildSectionInput,
  frSectionToPackRows,
  nfrSectionToPackRows,
};
