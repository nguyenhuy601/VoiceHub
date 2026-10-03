/**
 * APS consumer — Section Input from snapshot.canonicalRaw (Semantic Contract P1).
 * Mirror of project-service sectionInputContract (hydrate carries canonicalRaw; no PS import).
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
  scope: Object.freeze(['scope', 'scope_in', 'scope_out']),
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
    };
  }
  if (!canonicalRaw || typeof canonicalRaw !== 'object') {
    console.info('[canonical_raw_missing] section=%s', id);
    return {
      sectionId: id,
      ok: false,
      incomplete: true,
      missing: ['canonical_raw'],
      items: [],
      scalars: {},
      legacy: true,
    };
  }

  if (id === 'fr') {
    const items = asArray(canonicalRaw.content?.functionalBehaviors)
      .map((row) => ({
        requirement_identity: row.id || row.requirement_identity,
        functional_behavior: row.functional_behavior,
        business_request_reference: row.business_request_reference || '',
        requirement_type: row.requirement_type || '',
        functional_scope: row.functional_scope || '',
        actor: row.actor || '',
        priority: row.priority || '',
        acceptance_condition: row.acceptance_condition || '',
        customer_constraint_or_note: row.customer_constraint_or_note || '',
        provenance: row.provenance || {},
      }))
      .filter((i) => i.functional_behavior);
    return {
      sectionId: id,
      ok: items.length > 0,
      incomplete: items.length === 0,
      missing: items.length ? [] : ['functional_behavior'],
      items,
      scalars: {},
      registryVersion: canonicalRaw.registryVersion || null,
    };
  }

  if (id === 'nfr') {
    const items = asArray(canonicalRaw.content?.qualityRequirements).map((row) => ({
      nfr_identity: row.id || row.nfr_identity,
      quality_attribute: row.quality_attribute || '',
      quality_requirement: row.quality_requirement || '',
      quality_target: row.quality_target || '',
      priority: row.priority || '',
      provenance: row.provenance || {},
    }));
    return {
      sectionId: id,
      ok: items.length > 0,
      incomplete: items.length === 0,
      missing: items.length ? [] : ['quality_requirement'],
      items,
      scalars: {},
      impliedContext: {
        platform_constraint: canonicalRaw.constraints?.platform_constraint || null,
        business_constraint: canonicalRaw.constraints?.business_constraint || null,
      },
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
      business_request_title: brq.business_request_title,
      customer_statement: brq.customer_statement,
      business_problem: brq.business_problem,
      business_goal: brq.business_goal,
      business_benefit: brq.business_benefit,
      priority: brq.classification?.priority || null,
      stakeholder: brq.stakeholder || null,
    }));
    const goals = asArray(canonicalRaw.content?.businessGoals);
    const problems = asArray(canonicalRaw.content?.businessProblems);
    const incomplete =
      !scalars.business_objective && !goals.length && !problems.length && !items.length;
    if (incomplete) {
      console.info('[section_input] incomplete section=bg missing=business_goal_or_problem_or_objective');
    }
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
      registryVersion: canonicalRaw.registryVersion || null,
    };
  }

  const scalars = {
    scope: firstText(canonicalRaw.content?.scopes),
    scope_in: firstText(canonicalRaw.content?.scopeIn),
    scope_out: firstText(canonicalRaw.content?.scopeOut),
  };
  const items = [];
  if (scalars.scope_in) items.push({ type: 'in', description: scalars.scope_in });
  if (scalars.scope_out) items.push({ type: 'out', description: scalars.scope_out });
  if (!items.length && scalars.scope) items.push({ type: 'in', description: scalars.scope });
  return {
    sectionId: id,
    ok: items.length > 0,
    incomplete: items.length === 0,
    missing: items.length ? [] : ['scope'],
    items,
    scalars,
    registryVersion: canonicalRaw.registryVersion || null,
  };
}

function frSectionToPackRows(sectionInput) {
  return asArray(sectionInput?.items).map((row) => {
    const behavior = String(row.functional_behavior || '').trim();
    const priority = String(row.priority || 'Medium').trim().slice(0, 32) || 'Medium';
    return {
      externalId: String(row.requirement_identity || '').trim().slice(0, 64),
      id: String(row.requirement_identity || '').trim().slice(0, 64),
      // Align RequirementPack requirementNodeSchema + workbookFrExtract
      level: 'Requirement',
      parentExternalId: '',
      name: behavior.slice(0, 500),
      description: behavior.slice(0, 4000),
      moduleLabel: String(row.functional_scope || '').trim().slice(0, 240),
      actor: String(row.actor || '').trim().slice(0, 240),
      priority,
      // Pack / RequirementPack schema: acceptanceCriteria is String (not array)
      acceptanceCriteria: row.acceptance_condition
        ? String(row.acceptance_condition).slice(0, 4000)
        : '',
      requestId: String(row.business_request_reference || '').trim().slice(0, 64),
    };
  });
}

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

/**
 * Prefer canonicalRaw FR for G4; fall back to projected/pack lists.
 */
function resolveFrListForG4(snapshot, pack) {
  const canonicalRaw = snapshot?.canonicalRaw || pack?.aiAnalysis?.canonicalRaw;
  if (canonicalRaw) {
    const section = buildSectionInput('fr', canonicalRaw);
    if (section.ok && section.items.length) {
      return frSectionToPackRows(section);
    }
  }
  const srs = snapshot?.projected?.srs?.functionalRequirements;
  if (Array.isArray(srs) && srs.length) return srs;
  if (Array.isArray(snapshot?.functionalRequirements) && snapshot.functionalRequirements.length) {
    return snapshot.functionalRequirements;
  }
  if (Array.isArray(pack?.functionalRequirements) && pack.functionalRequirements.length) {
    return pack.functionalRequirements;
  }
  return [];
}

module.exports = {
  SECTION_WHITELISTS,
  buildSectionInput,
  frSectionToPackRows,
  nfrSectionToPackRows,
  resolveFrListForG4,
};
