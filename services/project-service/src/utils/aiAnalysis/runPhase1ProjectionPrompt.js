/**
 * Phase 1 Stage 2 projection — heuristic only in project-service (RULE-11).
 * LLM projection runs on ai-project-planning-service via phase_what / G4.
 */

const {
  buildRequirementAiContext,
} = require('../tools/buildRequirementAiContext');
const { buildProposedSrsDraft } = require('../tools/buildProposedSrsDraft');
const {
  isPhase1KnowledgeStubEnabled,
  sanitizePhase1Feedback,
} = require('./phase1KnowledgeContext');
const {
  pickEvidenceIdsForClaim,
  sanitizeEvidenceIds,
} = require('../tools/evidence/evidenceSpanExtract');

function isPhase1ToolsProposeEnabled() {
  const raw = String(process.env.PHASE1_TOOLS_PROPOSE ?? '1').trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off';
}

function attachEvidenceToRow(row, spans) {
  if (!row || typeof row !== 'object') return row;
  const level = String(row.level || '').toLowerCase();
  if (level === 'module' || level === 'feature') return row;
  const claim = String(row.description || row.name || row.text || '');
  let ids = sanitizeEvidenceIds(row.evidenceIds, spans);
  if (!ids.length && Array.isArray(spans) && spans.length) {
    ids = pickEvidenceIdsForClaim(claim, spans, 3);
  }
  return ids.length ? { ...row, evidenceIds: ids } : { ...row, evidenceIds: [] };
}

function attachEvidenceToSeedList(rows, spans) {
  if (!Array.isArray(rows)) return rows;
  return rows.map((r) => attachEvidenceToRow(r, spans));
}

function attachEvidenceToClarifications(clarifications, spans) {
  if (!Array.isArray(clarifications)) return clarifications;
  return clarifications.map((c) => {
    if (!c || typeof c !== 'object') return c;
    let ids = sanitizeEvidenceIds(c.evidenceIds, spans);
    if (!ids.length && Array.isArray(spans) && spans.length) {
      ids = pickEvidenceIdsForClaim(String(c.text || ''), spans, 3);
    }
    return { ...c, evidenceIds: ids };
  });
}

/**
 * When pack has no FR yet, seed Module→Feature→Requirement rows from clarifications / tool extras
 * so materialize can fill FR → UC tabs. (Hierarchy merge requires an existing Module parent.)
 */
function buildSeedFrTreeFromTools({ pack, insights, extras = {}, evidenceSpans = [] }) {
  const existingFr = Array.isArray(pack?.functionalRequirements)
    ? pack.functionalRequirements.length
    : 0;
  if (existingFr > 0) return null;

  const understanding = String(insights?.understanding || '').trim();
  const rows = [
    {
      externalId: 'M-001',
      level: 'Module',
      parentExternalId: '',
      name: 'AI Draft Module',
      description: understanding.slice(0, 4000) || 'Seeded by Phase1 tools_propose',
      priority: 'Medium',
      status: 'Draft',
      baNote: 'seeded:phase1_tools',
    },
    {
      externalId: 'F-001',
      level: 'Feature',
      parentExternalId: 'M-001',
      name: 'Core capabilities (AI draft)',
      description: understanding.slice(0, 4000) || 'Draft feature from Phase1 tools',
      moduleLabel: 'AI Draft Module',
      priority: 'Medium',
      status: 'Draft',
      baNote: 'seeded:phase1_tools',
    },
  ];

  const pushReq = (text, priority = 'Medium', evidenceIds = null) => {
    const body = String(text || '').trim();
    if (!body || body.length < 3) return;
    const leafCount = rows.filter((r) => r.level === 'Requirement').length;
    if (leafCount >= 40) return;
    const idx = leafCount + 1;
    let ids = sanitizeEvidenceIds(evidenceIds, evidenceSpans);
    if (!ids.length && evidenceSpans.length) {
      ids = pickEvidenceIdsForClaim(body, evidenceSpans, 3);
    }
    rows.push({
      externalId: `FR-${String(idx).padStart(3, '0')}`,
      level: 'Requirement',
      parentExternalId: 'F-001',
      name: body.slice(0, 240),
      description: body.slice(0, 4000),
      moduleLabel: 'AI Draft Module',
      featureLabel: 'Core capabilities (AI draft)',
      priority,
      status: 'Draft',
      baNote: 'seeded:phase1_tools',
      evidenceIds: ids,
    });
  };

  for (const c of Array.isArray(insights?.clarifications) ? insights.clarifications : []) {
    if (c.frId) continue;
    pushReq(c.text, c.priority || 'Medium', c.evidenceIds);
  }
  for (const item of Array.isArray(extras.ambiguityItems) ? extras.ambiguityItems : []) {
    if (item.externalId || item.frId) continue;
    pushReq(item.message || item.text || item.reason, item.severity || 'Medium', item.evidenceIds);
  }
  for (const item of Array.isArray(extras.gapItems) ? extras.gapItems : []) {
    const sev = String(item.severity || item.priority || '').toLowerCase();
    if (sev === 'critical' || sev === 'high') continue;
    pushReq(item.message || item.text || item.title, item.severity || 'Medium', item.evidenceIds);
  }

  if (rows.filter((r) => r.level === 'Requirement').length === 0 && understanding) {
    pushReq(understanding, 'Medium');
  }

  return attachEvidenceToSeedList(rows, evidenceSpans);
}

function withStructuredHierarchy(result, pack, extras = {}, evidenceSpans = []) {
  if (!result || typeof result !== 'object') return result;
  const insights = result.insights
    ? {
        ...result.insights,
        clarifications: attachEvidenceToClarifications(
          result.insights.clarifications,
          evidenceSpans
        ),
      }
    : result.insights;
  const seedFrList = buildSeedFrTreeFromTools({
    pack,
    insights,
    extras,
    evidenceSpans,
  });
  return {
    ...result,
    insights,
    seedFrList: seedFrList || attachEvidenceToSeedList(result.seedFrList, evidenceSpans) || null,
    hierarchy: result.hierarchy || null,
  };
}

/**
 * Heuristic projection when LLM skipped/disabled — clarifications from ambiguity extras.
 */
function buildHeuristicProjection({
  pack,
  requirementTools,
  extras = {},
  evidenceSpans = [],
}) {
  const ambiguityItems = Array.isArray(extras.ambiguityItems) ? extras.ambiguityItems : [];
  const gapItems = Array.isArray(extras.gapItems) ? extras.gapItems : [];
  const clarifications = [];

  for (const item of ambiguityItems.slice(0, 20)) {
    const text = String(item.message || item.text || item.reason || '').trim();
    if (!text) continue;
    clarifications.push({
      id: `amb-${clarifications.length + 1}`,
      frId: item.externalId || item.frId || null,
      field: 'description',
      text: `Làm rõ: ${text}`,
      priority: item.severity || 'Medium',
      evidenceIds: pickEvidenceIdsForClaim(text, evidenceSpans, 3),
    });
  }
  for (const item of gapItems.slice(0, 15)) {
    const text = String(item.message || item.text || item.title || '').trim();
    if (!text) continue;
    clarifications.push({
      id: `gap-${clarifications.length + 1}`,
      frId: item.externalId || item.frId || null,
      field: 'description',
      text: `Bổ sung: ${text}`,
      priority: item.severity || 'High',
      evidenceIds: pickEvidenceIdsForClaim(text, evidenceSpans, 3),
    });
  }

  const facts = requirementTools?.facts || {};
  const gateA = requirementTools?.gateA || null;
  const insights = {
    schemaVersion: 'requirementInsights.phase1Projection.v1',
    understanding: [
      'Heuristic projection (LLM skipped).',
      `GateA: ${gateA?.passed === true ? 'passed' : gateA?.passed === false ? 'failed' : 'n/a'}.`,
      `completeness=${facts['completeness.score'] ?? 'n/a'}`,
      `coverage.weighted=${facts['coverage.weighted'] ?? 'n/a'}`,
      `conflicts=${facts['consistency.conflictCount'] ?? 'n/a'}`,
    ].join(' '),
    clarifications,
    businessImpact: { summary: 'Review tool facts before Gate 1.' },
    source: 'heuristic_tools_only',
  };

  const proposedSrs = buildProposedSrsDraft(pack, insights);
  proposedSrs.meta = {
    ...(proposedSrs.meta || {}),
    generatedFrom: 'phase1_heuristic_projection',
  };

  return withStructuredHierarchy(
    {
      ok: true,
      skippedLlm: true,
      insights,
      proposedSrs,
      hierarchy: null,
      model: null,
    },
    pack,
    extras,
    evidenceSpans
  );
}

function normalizeLlmProjection(data, pack, requirementTools, evidenceSpans = []) {
  const raw = data && typeof data === 'object' ? data : {};
  const clarifications = Array.isArray(raw.clarifications)
    ? raw.clarifications
        .map((c, i) => {
          const text = String(c.text || c.proposedText || '').trim();
          let ids = sanitizeEvidenceIds(c.evidenceIds, evidenceSpans);
          if (!ids.length && text && evidenceSpans.length) {
            ids = pickEvidenceIdsForClaim(text, evidenceSpans, 3);
          }
          return {
            id: c.id || `c-${i + 1}`,
            frId: c.frId || c.externalId || null,
            field: String(c.field || 'description').trim() || 'description',
            text,
            priority: c.priority || 'Medium',
            evidenceIds: ids,
          };
        })
        .filter((c) => c.text)
    : [];

  const insights = {
    schemaVersion: 'requirementInsights.phase1Projection.v1',
    understanding: String(raw.understanding || raw.summary || '').trim().slice(0, 4000),
    clarifications,
    businessImpact:
      typeof raw.businessImpact === 'string'
        ? { summary: raw.businessImpact.slice(0, 2000) }
        : raw.businessImpact && typeof raw.businessImpact === 'object'
          ? raw.businessImpact
          : { summary: '' },
    source: 'phase1_projection_llm',
  };

  let proposedSrs =
    raw.proposedSrs && typeof raw.proposedSrs === 'object'
      ? raw.proposedSrs
      : buildProposedSrsDraft(pack, insights);

  if (!Array.isArray(proposedSrs.deltas)) {
    proposedSrs = buildProposedSrsDraft(pack, insights);
  }
  proposedSrs.meta = {
    ...(proposedSrs.meta || {}),
    generatedFrom: 'phase1_projection_llm',
    gateAPassed: requirementTools?.gateA?.passed ?? null,
  };

  const hierarchy =
    raw.hierarchy && typeof raw.hierarchy === 'object'
      ? {
          proposedFeatures: Array.isArray(raw.hierarchy.proposedFeatures)
            ? raw.hierarchy.proposedFeatures.slice(0, 40)
            : [],
          proposedRequirements: Array.isArray(raw.hierarchy.proposedRequirements)
            ? raw.hierarchy.proposedRequirements.slice(0, 80).map((r) => {
                if (!r || typeof r !== 'object') return r;
                let ids = sanitizeEvidenceIds(r.evidenceIds, evidenceSpans);
                if (!ids.length && evidenceSpans.length) {
                  ids = pickEvidenceIdsForClaim(
                    String(r.description || r.title || ''),
                    evidenceSpans,
                    3
                  );
                }
                return { ...r, evidenceIds: ids };
              })
            : [],
        }
      : null;

  return { insights, proposedSrs, hierarchy };
}

/**
 * Heuristic projection only. LLM path throws RULE11 (use remote phase_what).
 */
async function runPhase1ProjectionPrompt({
  pack,
  requirementTools = null,
  extras = {},
  knowledge = null,
  semanticSummary = null,
  feedback = '',
  evidenceSpans = [],
  generateJsonFn = null,
} = {}) {
  void generateJsonFn;
  const tools =
    requirementTools || pack?.aiAnalysis?.analyses?.requirementTools || null;
  const feedbackClean = sanitizePhase1Feedback(feedback);
  const knowledgeForPrompt =
    isPhase1KnowledgeStubEnabled() && knowledge ? knowledge : null;
  const spans = Array.isArray(evidenceSpans) ? evidenceSpans : [];

  const context = buildRequirementAiContext({
    pack,
    requirementTools: tools,
    extras,
    knowledge: knowledgeForPrompt,
    semanticSummary,
  });

  if (!isPhase1ToolsProposeEnabled()) {
    return {
      ...withStructuredHierarchy(
        buildHeuristicProjection({
          pack,
          requirementTools: tools,
          extras,
          evidenceSpans: spans,
        }),
        pack,
        extras,
        spans
      ),
      requirementAiContext: context,
      feedbackApplied: Boolean(feedbackClean),
    };
  }

  // RULE-11: LLM projection lives on ai-project-planning-service (phase_what / G4).
  const err = new Error(
    'In-process Phase1 LLM projection is forbidden — use remote phase_what (APS)'
  );
  err.code = 'RULE11_INPROCESS_LLM_FORBIDDEN';
  err.statusCode = 503;
  err.errorCode = 'RULE11_INPROCESS_LLM_FORBIDDEN';
  throw err;
}

module.exports = {
  isPhase1ToolsProposeEnabled,
  runPhase1ProjectionPrompt,
  buildHeuristicProjection,
  normalizeLlmProjection,
  buildSeedFrTreeFromTools,
  withStructuredHierarchy,
  attachEvidenceToSeedList,
};
