/**
 * Materialize AI WHAT analyses → RequirementPack sheets (Analysis-equivalent shape).
 * Pure — no Mongo. Used after WHAT jobs complete before seedArtifactsFromRequirementPack.
 */

const { mergeHierarchyProposalsIntoFrList } = require('./aiAnalysisHierarchyMerge');
const { normId, normProse } = require('../requirement/requirementTemplateTextNorm');
const {
  isPhase1RequireEvidence,
  filterSeedRowsRequiringEvidence,
  pickEvidenceIdsForClaim,
} = require('../tools/evidence/evidenceSpanExtract');

function cloneRow(row) {
  return row && typeof row === 'object' ? { ...row } : row;
}

function ensureArray(value) {
  return Array.isArray(value) ? value.map(cloneRow) : [];
}

/**
 * Apply proposedSrs deltas onto FR/NFR rows (append to field text).
 */
function applyDeltasToFrList(frList, deltas) {
  const list = ensureArray(frList);
  const byId = new Map(list.map((r) => [normId(r.externalId || r.externalKey), r]));
  const notes = [];

  for (const delta of Array.isArray(deltas) ? deltas : []) {
    if (!delta || delta.applied) continue;
    const text = normProse(delta.proposedText || '');
    if (!text) continue;
    const kind = String(delta.kind || '').toLowerCase();
    const field = String(delta.field || 'description').trim() || 'description';
    const extId = normId(delta.externalId || '');

    if ((kind === 'fr_patch' || extId) && extId && byId.has(extId)) {
      const row = byId.get(extId);
      const prev = String(row[field] || row.description || '').trim();
      row[field] = prev ? `${prev}\n${text}` : text;
      if (field !== 'description' && !row.description) {
        row.description = text;
      }
      delta.applied = true;
      continue;
    }
    notes.push(text);
    delta.applied = true;
  }

  return { frList: list, packNotes: notes };
}

/**
 * Best-effort BG / SCOPE / BR / BPM / UC / NFR from overview + insights + capability + gap.
 */
function enrichSheetsFromAnalyses(pack, container) {
  const overview = pack.overview && typeof pack.overview === 'object' ? { ...pack.overview } : {};
  const insights = container?.analyses?.requirementInsights || {};
  const capabilityItems = Array.isArray(container?.analyses?.capability?.items)
    ? container.analyses.capability.items
    : [];
  const gapItems = Array.isArray(container?.analyses?.gap?.items)
    ? container.analyses.gap.items
    : [];

  let businessGoals = ensureArray(pack.businessGoals);
  let scope = ensureArray(pack.scope);
  let businessRules = ensureArray(pack.businessRules);
  let businessProcesses = ensureArray(pack.businessProcesses);
  let useCases = ensureArray(pack.useCases);
  let nonFunctionalRequirements = ensureArray(
    pack.nonFunctionalRequirements || pack.nfrs
  );

  const understanding = normProse(insights.understanding || '');
  const businessImpact = normProse(
    typeof insights.businessImpact === 'string'
      ? insights.businessImpact
      : insights.businessImpact?.summary || ''
  );
  const objective = normProse(overview.projectObjective || overview.requirementName || '');
  const businessScope = normProse(overview.businessScope || '');

  if (!businessGoals.length && (objective || understanding || businessImpact)) {
    businessGoals = [
      {
        externalId: 'BG-001',
        title: (objective || 'Business Goal').slice(0, 240),
        statement: objective || understanding || businessImpact,
        businessProblem: businessImpact || '',
        expectedBusinessOutcome: understanding || '',
        successMetric: normProse(overview.expectedUsers || overview.expectedScale || ''),
        priority: normProse(overview.priority || 'Medium') || 'Medium',
        stakeholder: '',
        assumption: '',
        constraint: '',
        status: 'Draft',
        baNote: 'seeded:ai_what',
        customerRequirementIds: [],
      },
    ];
  }

  if (!scope.length && (businessScope || understanding)) {
    scope = [
      {
        type: 'in',
        scopeType: 'in',
        description: (businessScope || understanding).slice(0, 4000),
      },
    ];
  }

  // Capability → BR stubs when BR empty
  if (!businessRules.length && capabilityItems.length) {
    businessRules = capabilityItems.slice(0, 40).map((item, idx) => {
      const name = normProse(item.name || item.label || item.capability || `Capability ${idx + 1}`);
      const desc = normProse(item.description || item.summary || name);
      return {
        externalId: `BR-${String(idx + 1).padStart(3, '0')}`,
        relatedBg: businessGoals[0]?.externalId || 'BG-001',
        title: name.slice(0, 240),
        description: desc,
        businessRule: desc,
        whenApplies: '',
        exception: '',
        stakeholder: '',
        priority: 'Medium',
        successCriteria: '',
        dependency: '',
        assumption: '',
        constraint: '',
        status: 'Draft',
        baNote: 'seeded:ai_what:capability',
        customerRequirementIds: [],
      };
    });
  }

  // Tool-first: clarifications without FR → BR stubs when no capability analysis
  const clarifications = Array.isArray(insights.clarifications) ? insights.clarifications : [];
  if (!businessRules.length && clarifications.length) {
    businessRules = clarifications.slice(0, 20).map((c, idx) => {
      const text = normProse(c.text || '');
      return {
        externalId: `BR-${String(idx + 1).padStart(3, '0')}`,
        relatedBg: businessGoals[0]?.externalId || 'BG-001',
        title: text.slice(0, 240) || `Rule ${idx + 1}`,
        description: text,
        businessRule: text,
        whenApplies: '',
        exception: '',
        stakeholder: '',
        priority: c.priority || 'Medium',
        successCriteria: '',
        dependency: '',
        assumption: '',
        constraint: '',
        status: 'Draft',
        baNote: 'seeded:phase1_tools:clarification',
        customerRequirementIds: [],
      };
    });
  }

  // Gaps → NFR (all severities when empty; prefer high/critical first)
  const rankedGaps = [...gapItems].sort((a, b) => {
    const rank = (g) => {
      const s = String(g.severity || g.priority || '').toLowerCase();
      if (s === 'critical') return 0;
      if (s === 'high') return 1;
      if (s === 'medium') return 2;
      return 3;
    };
    return rank(a) - rank(b);
  });
  const evidenceSpans = Array.isArray(container?.analyses?.evidenceSpans)
    ? container.analyses.evidenceSpans
    : [];
  if (!nonFunctionalRequirements.length && rankedGaps.length) {
    nonFunctionalRequirements = rankedGaps.slice(0, 20).map((g, idx) => {
      const reqText = normProse(g.message || g.title || g.requirement || 'Gap from AI analysis');
      const evidenceIds =
        Array.isArray(g.evidenceIds) && g.evidenceIds.length
          ? g.evidenceIds
          : pickEvidenceIdsForClaim(reqText, evidenceSpans, 3);
      return {
        externalId: `NFR-${String(idx + 1).padStart(3, '0')}`,
        category: normProse(g.category || g.type || 'Quality'),
        requirement: reqText,
        name: normProse(g.message || g.title || `Gap ${idx + 1}`).slice(0, 240),
        target: '',
        measurement: '',
        priority: String(g.severity || g.priority || 'Medium'),
        scope: '',
        constraint: '',
        verification: '',
        acceptanceCriteria: '',
        source: 'ai_what',
        status: 'Draft',
        baNote: 'seeded:ai_what:gap',
        customerRequirementIds: [],
        evidenceIds,
        groundingStatus: g.groundingStatus,
        groundingScore: g.groundingScore,
      };
    });
  }

  // FR leaves → lightweight UC when UC empty; fallback clarifications if no Requirement leaves
  const frList = ensureArray(pack.functionalRequirements);
  if (!useCases.length) {
    const leaves = frList.filter((r) => {
      const level = String(r.level || '').toLowerCase();
      return level === 'requirement' || level === '';
    });
    if (leaves.length) {
      useCases = leaves.slice(0, 30).map((fr, idx) => ({
        externalId: `UC-${String(idx + 1).padStart(3, '0')}`,
        title: normProse(fr.name || fr.externalId || `Use case ${idx + 1}`).slice(0, 240),
        goal: normProse(fr.description || ''),
        actor: normProse(fr.actor || ''),
        precondition: normProse(fr.preconditions || ''),
        mainFlow: normProse(fr.mainFlow || fr.description || ''),
        alternateFlow: '',
        exceptionFlow: normProse(fr.exceptionFlow || ''),
        postcondition: '',
        relatedFrIds: fr.externalId ? [String(fr.externalId)] : [],
        relatedFr: fr.externalId || '',
        priority: fr.priority || 'Medium',
        status: 'Draft',
        baNote: 'seeded:ai_what:fr',
        customerRequirementIds: Array.isArray(fr.customerRequirementIds)
          ? fr.customerRequirementIds
          : [],
        evidenceIds: Array.isArray(fr.evidenceIds) ? fr.evidenceIds : [],
      }));
    } else {
      const clarifications = Array.isArray(insights.clarifications)
        ? insights.clarifications
        : [];
      const fromClarifications = clarifications
        .map((c) => normProse(c.text || ''))
        .filter((t) => t.length >= 3)
        .slice(0, 20);
      const fallbackTexts =
        fromClarifications.length > 0
          ? fromClarifications
          : understanding
            ? [understanding.slice(0, 400)]
            : [];
      useCases = fallbackTexts.map((text, idx) => ({
        externalId: `UC-${String(idx + 1).padStart(3, '0')}`,
        title: text.slice(0, 240),
        goal: text.slice(0, 4000),
        actor: '',
        precondition: '',
        mainFlow: text.slice(0, 4000),
        alternateFlow: '',
        exceptionFlow: '',
        postcondition: '',
        relatedFrIds: [],
        relatedFr: '',
        priority: clarifications[idx]?.priority || 'Medium',
        status: 'Draft',
        baNote: 'seeded:ai_what:clarification',
        customerRequirementIds: [],
        evidenceIds: Array.isArray(clarifications[idx]?.evidenceIds)
          ? clarifications[idx].evidenceIds
          : [],
      }));
    }
  }

  // BPM from BR when empty
  if (!businessProcesses.length && businessRules.length) {
    businessProcesses = businessRules.slice(0, 20).map((br, idx) => ({
      externalId: `BPM-${String(idx + 1).padStart(3, '0')}`,
      relatedBr: br.externalId || '',
      processName: normProse(br.title || br.externalId || `Process ${idx + 1}`),
      processDescription: normProse(br.description || ''),
      trigger: '',
      actor: normProse(br.stakeholder || ''),
      precondition: '',
      step: '1',
      action: normProse(br.description || br.businessRule || ''),
      input: '',
      output: '',
      businessRule: normProse(br.businessRule || ''),
      exception: '',
      relatedCr: '',
      relatedSystems: '',
      status: 'Draft',
      baNote: 'seeded:ai_what:br',
    }));
  }

  return {
    overview,
    businessGoals,
    scope,
    businessRules,
    businessProcesses,
    useCases,
    nonFunctionalRequirements,
  };
}

/**
 * Accept all hierarchy proposals (for auto-confirm WHAT).
 */
function acceptAllHierarchyProposals(container) {
  if (!container?.analyses?.hierarchy) return container;
  const hierarchy = { ...container.analyses.hierarchy };
  const mark = (list) =>
    (Array.isArray(list) ? list : []).map((p) =>
      p && typeof p === 'object'
        ? { ...p, status: p.status === 'rejected' ? 'rejected' : 'accepted' }
        : p
    );
  hierarchy.proposedFeatures = mark(hierarchy.proposedFeatures);
  hierarchy.proposedRequirements = mark(hierarchy.proposedRequirements);
  return {
    ...container,
    analyses: {
      ...container.analyses,
      hierarchy,
    },
  };
}

/**
 * Apply AI WHAT outputs onto a pack plain object (Analysis-equivalent sheets).
 * @returns {{ pack: object, meta: { addedFrCount, deltaCount, sheetsTouched } }}
 */
function applyProposedSrsToPack(packInput, containerInput) {
  const pack = packInput && typeof packInput === 'object' ? { ...packInput } : {};
  let container =
    containerInput && typeof containerInput === 'object'
      ? containerInput
      : pack.aiAnalysis || {};

  // Tool-first seed tree (Module→Feature→FR) when pack sheets empty
  let seededSkippedNoCite = 0;
  const evidenceSpansForFilter = Array.isArray(container?.analyses?.evidenceSpans)
    ? container.analyses.evidenceSpans
    : [];
  const enforceEvidence =
    isPhase1RequireEvidence() && evidenceSpansForFilter.length > 0;
  const seedFr = container?.analyses?.phase1SeedFr;
  if (
    Array.isArray(seedFr) &&
    seedFr.length &&
    !(Array.isArray(pack.functionalRequirements) && pack.functionalRequirements.length)
  ) {
    const filtered = filterSeedRowsRequiringEvidence(seedFr, {
      require: enforceEvidence,
    });
    seededSkippedNoCite += Number(filtered.skippedNoCite) || 0;
    pack.functionalRequirements = filtered.kept.map((row) =>
      row && typeof row === 'object' ? { ...row } : row
    );
  }

  container = acceptAllHierarchyProposals(container);
  const hierarchy = container.analyses?.hierarchy || {};

  const merged = mergeHierarchyProposalsIntoFrList(
    pack.functionalRequirements || [],
    {
      proposedFeatures: hierarchy.proposedFeatures || [],
      proposedRequirements: hierarchy.proposedRequirements || [],
    },
    { onlyAccepted: true }
  );
  // Attach evidenceIds from accepted proposedRequirements when present
  const proposedReqById = new Map(
    (hierarchy.proposedRequirements || [])
      .filter((r) => r && r.externalId)
      .map((r) => [normId(r.externalId), r])
  );
  pack.functionalRequirements = merged.frList.map((row) => {
    if (!row || typeof row !== 'object') return row;
    if (Array.isArray(row.evidenceIds) && row.evidenceIds.length) return row;
    const prop = proposedReqById.get(normId(row.externalId));
    if (prop && Array.isArray(prop.evidenceIds) && prop.evidenceIds.length) {
      return { ...row, evidenceIds: prop.evidenceIds };
    }
    return row;
  });
  // Drop AI-seeded Requirement leaves missing cite (prefills untouched)
  if (enforceEvidence) {
    const next = [];
    for (const row of pack.functionalRequirements) {
      if (!row) continue;
      const level = String(row.level || '').toLowerCase();
      const seeded = String(row.baNote || '').includes('seeded:phase1_tools');
      if (seeded && level === 'requirement') {
        const ids = Array.isArray(row.evidenceIds)
          ? row.evidenceIds.filter(Boolean)
          : [];
        if (!ids.length) {
          seededSkippedNoCite += 1;
          continue;
        }
      }
      next.push(row);
    }
    pack.functionalRequirements = next;
  }

  const proposedSrs = container.analyses?.proposedSrs || {};
  const deltas = Array.isArray(proposedSrs.deltas) ? proposedSrs.deltas.map((d) => ({ ...d })) : [];
  const { frList, packNotes } = applyDeltasToFrList(pack.functionalRequirements, deltas);
  pack.functionalRequirements = frList;

  if (packNotes.length) {
    const overview = pack.overview && typeof pack.overview === 'object' ? { ...pack.overview } : {};
    const prev = String(overview.baNote || overview.notes || '').trim();
    overview.baNote = prev
      ? `${prev}\n${packNotes.join('\n')}`
      : packNotes.join('\n');
    pack.overview = overview;
  }

  // Re-attach updated deltas
  if (container.analyses) {
    container = {
      ...container,
      analyses: {
        ...container.analyses,
        proposedSrs: {
          ...proposedSrs,
          deltas,
        },
      },
    };
  }

  const sheets = enrichSheetsFromAnalyses(pack, container);
  pack.overview = { ...(pack.overview || {}), ...sheets.overview };
  if (sheets.businessGoals.length) pack.businessGoals = sheets.businessGoals;
  if (sheets.scope.length) pack.scope = sheets.scope;
  if (sheets.businessRules.length) pack.businessRules = sheets.businessRules;
  if (sheets.businessProcesses.length) pack.businessProcesses = sheets.businessProcesses;
  if (sheets.useCases.length) pack.useCases = sheets.useCases;
  if (sheets.nonFunctionalRequirements.length) {
    let nfrs = sheets.nonFunctionalRequirements;
    if (enforceEvidence) {
      const nextNfr = [];
      for (const row of nfrs) {
        const ids = Array.isArray(row.evidenceIds)
          ? row.evidenceIds.filter(Boolean)
          : [];
        if (!ids.length) {
          seededSkippedNoCite += 1;
          continue;
        }
        nextNfr.push(row);
      }
      nfrs = nextNfr;
    }
    pack.nonFunctionalRequirements = nfrs;
  }

  pack.aiAnalysis = container;

  const sheetsTouched = [
    'functionalRequirements',
    sheets.businessGoals.length ? 'businessGoals' : null,
    sheets.scope.length ? 'scope' : null,
    sheets.businessRules.length ? 'businessRules' : null,
    sheets.businessProcesses.length ? 'businessProcesses' : null,
    sheets.useCases.length ? 'useCases' : null,
    sheets.nonFunctionalRequirements.length ? 'nonFunctionalRequirements' : null,
  ].filter(Boolean);

  return {
    pack,
    meta: {
      addedFrCount: merged.addedCount || 0,
      deltaCount: deltas.length,
      sheetsTouched,
      seededSkippedNoCite,
    },
  };
}

module.exports = {
  applyProposedSrsToPack,
  applyDeltasToFrList,
  enrichSheetsFromAnalyses,
  acceptAllHierarchyProposals,
};
