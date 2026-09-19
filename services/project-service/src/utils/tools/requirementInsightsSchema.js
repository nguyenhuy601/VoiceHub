/**
 * requirementInsights.v1 — Phase 1 stages 7–8 contract.
 * Deterministic normalize; no Mongo/HTTP.
 */

const INSIGHTS_SCHEMA_VERSION = 'requirementInsights.v1';

const REQUIRED_TOP_KEYS = Object.freeze([
  'understanding',
  'quality',
  'ambiguityGaps',
  'conflicts',
  'businessImpact',
  'technicalImpact',
  'planningRelevance',
  'clarifications',
  'evidence',
]);

function isRequirementInsightsEnabled() {
  const raw = String(process.env.REQUIREMENT_INSIGHTS || '1').trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off';
}

function truncate(text, max = 800) {
  const s = String(text || '').trim();
  if (!s) return '';
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function normalizeEvidenceItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw.source && typeof raw.source === 'object' ? raw.source : {};
  const tool = source.tool != null ? String(source.tool).trim() : '';
  const frId = source.frId != null ? String(source.frId).trim() : '';
  const packField = source.packField != null ? String(source.packField).trim() : '';
  if (!tool && !frId && !packField) return null;
  return {
    id: String(raw.id || '').trim() || undefined,
    claim: truncate(raw.claim || raw.message || '', 500),
    source: {
      ...(tool ? { tool } : {}),
      ...(frId ? { frId } : {}),
      ...(packField ? { packField } : {}),
    },
  };
}

function normalizeClarification(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const text = truncate(raw.text || raw.suggestion || raw.message || '', 1000);
  if (!text) return null;
  return {
    id: String(raw.id || '').trim() || undefined,
    frId: raw.frId != null ? String(raw.frId).trim() : undefined,
    field: raw.field != null ? String(raw.field).trim() : undefined,
    text,
    priority: ['Critical', 'High', 'Medium', 'Low'].includes(String(raw.priority || ''))
      ? String(raw.priority)
      : 'Medium',
  };
}

function emptyQualityFromFacts(facts = {}, gateA = null) {
  return {
    coverageWeighted:
      facts['coverage.weighted'] != null ? Number(facts['coverage.weighted']) : null,
    completenessScore:
      facts['completeness.score'] != null ? Number(facts['completeness.score']) : null,
    gateAPassed: gateA?.passed != null ? Boolean(gateA.passed) : facts['gateA.passed'] ?? null,
    summary: '',
  };
}

/**
 * Build heuristic insights purely from Facts + pack overview (no LLM).
 */
function buildHeuristicRequirementInsights({
  pack = {},
  requirementTools = null,
  whatAnalyses = null,
} = {}) {
  const tools =
    requirementTools || pack?.aiAnalysis?.analyses?.requirementTools || null;
  const facts = (tools?.facts && typeof tools.facts === 'object' ? tools.facts : {}) || {};
  const gateA = tools?.gateA && typeof tools.gateA === 'object' ? tools.gateA : null;
  const overview = pack?.overview || {};
  const name = String(overview.requirementName || '').trim();
  const objective = String(overview.projectObjective || '').trim();

  const conflictCount = Number(facts['consistency.conflictCount']);
  const ambiguousCount = Number(facts['scope.ambiguousCount']);
  const uncovered = Number(facts['coverage.uncoveredCount']);
  const missingTotal = Number(facts['completeness.missingTotal']);

  const evidence = [];
  const pushFact = (key, claim) => {
    if (facts[key] === undefined || facts[key] === null) return;
    evidence.push({
      claim,
      source: { tool: 'requirementTools', packField: `facts.${key}` },
    });
  };
  pushFact('coverage.weighted', `coverage.weighted=${facts['coverage.weighted']}`);
  pushFact('completeness.score', `completeness.score=${facts['completeness.score']}`);
  pushFact(
    'consistency.conflictCount',
    `consistency.conflictCount=${facts['consistency.conflictCount']}`
  );
  pushFact(
    'scope.ambiguousCount',
    `scope.ambiguousCount=${facts['scope.ambiguousCount']}`
  );
  if (gateA) {
    evidence.push({
      claim: `gateA.passed=${Boolean(gateA.passed)}`,
      source: { tool: 'gate_a_requirement_quality' },
    });
  }

  const clarifications = [];
  if (Number.isFinite(ambiguousCount) && ambiguousCount > 0) {
    clarifications.push({
      id: 'clarify-ambiguity',
      text: `Có ${ambiguousCount} tín hiệu ambiguity — làm rõ điều kiện / tiêu chí chấp nhận trước khi planning.`,
      priority: 'High',
      field: 'description',
    });
  }
  if (Number.isFinite(uncovered) && uncovered > 0) {
    clarifications.push({
      id: 'clarify-coverage',
      text: `Còn ${uncovered} leaf chưa covered — bổ sung capability/trace hoặc chấp nhận gap có audit.`,
      priority: 'High',
      field: 'trace',
    });
  }
  if (Number.isFinite(missingTotal) && missingTotal > 0) {
    clarifications.push({
      id: 'clarify-completeness',
      text: `Thiếu ${missingTotal} field completeness — bổ sung AC/input/output nếu planning-critical.`,
      priority: 'Medium',
      field: 'ac',
    });
  }

  const gapItems = Array.isArray(whatAnalyses?.gap?.items) ? whatAnalyses.gap.items : [];
  for (const g of gapItems.slice(0, 8)) {
    const frId = g.frId || g.externalId || g.requirementId;
    clarifications.push({
      id: `gap-${String(frId || clarifications.length)}`,
      frId: frId ? String(frId) : undefined,
      text: truncate(g.message || g.title || g.description || 'Gap detected', 500),
      priority: g.severity === 'critical' || g.severity === 'high' ? 'High' : 'Medium',
      field: 'gap',
    });
  }

  const quality = emptyQualityFromFacts(facts, gateA);
  quality.summary = [
    quality.coverageWeighted != null ? `coverage=${quality.coverageWeighted}` : null,
    quality.completenessScore != null ? `completeness=${quality.completenessScore}` : null,
    quality.gateAPassed != null ? `gateA=${quality.gateAPassed}` : null,
  ]
    .filter(Boolean)
    .join('; ');

  return normalizeRequirementInsights({
    understanding: {
      name,
      objective,
      narrative: name
        ? `Pack "${name}" — reasoning từ Tool Facts (heuristic).`
        : 'Requirement pack — reasoning từ Tool Facts (heuristic).',
    },
    quality,
    ambiguityGaps: {
      ambiguousCount: Number.isFinite(ambiguousCount) ? ambiguousCount : null,
      expansionCount: Number(facts['scope.expansionCount']) || 0,
      uncoveredCount: Number.isFinite(uncovered) ? uncovered : null,
      missingTotal: Number.isFinite(missingTotal) ? missingTotal : null,
      items: clarifications
        .filter((c) => c.id?.startsWith('clarify-') || c.field === 'gap')
        .slice(0, 20),
    },
    conflicts: {
      conflictCount: Number.isFinite(conflictCount) ? conflictCount : null,
      items: [],
    },
    businessImpact: {
      summary: objective ? truncate(objective, 400) : '',
      priority: String(overview.priority || '').trim() || null,
    },
    technicalImpact: {
      summary: '',
      platform: Array.isArray(overview.platform)
        ? overview.platform.map(String).slice(0, 8)
        : overview.platform
          ? [String(overview.platform)]
          : [],
    },
    planningRelevance: {
      level:
        facts['planning.relevance'] ||
        (quality.gateAPassed === false ? 'HIGH' : 'MEDIUM'),
      summary:
        quality.gateAPassed === false
          ? 'Gate A chưa đạt — planning impact cao nếu duyệt sớm.'
          : 'Planning relevance từ quality facts.',
    },
    clarifications,
    evidence,
    meta: { mode: 'heuristic', schema: INSIGHTS_SCHEMA_VERSION },
  });
}

/**
 * Normalize arbitrary LLM/heuristic payload into requirementInsights.v1.
 */
function normalizeRequirementInsights(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const factsQuality =
    src.quality && typeof src.quality === 'object' ? src.quality : {};

  const evidence = Array.isArray(src.evidence)
    ? src.evidence.map(normalizeEvidenceItem).filter(Boolean).slice(0, 60)
    : [];
  const clarifications = Array.isArray(src.clarifications)
    ? src.clarifications.map(normalizeClarification).filter(Boolean).slice(0, 40)
    : [];

  const understanding =
    src.understanding && typeof src.understanding === 'object'
      ? {
          name: truncate(src.understanding.name || '', 200),
          objective: truncate(src.understanding.objective || '', 800),
          narrative: truncate(src.understanding.narrative || '', 2000),
        }
      : { name: '', objective: '', narrative: '' };

  const ambiguityGaps =
    src.ambiguityGaps && typeof src.ambiguityGaps === 'object'
      ? {
          ambiguousCount:
            src.ambiguityGaps.ambiguousCount != null
              ? Number(src.ambiguityGaps.ambiguousCount)
              : null,
          expansionCount: Number(src.ambiguityGaps.expansionCount) || 0,
          uncoveredCount:
            src.ambiguityGaps.uncoveredCount != null
              ? Number(src.ambiguityGaps.uncoveredCount)
              : null,
          missingTotal:
            src.ambiguityGaps.missingTotal != null
              ? Number(src.ambiguityGaps.missingTotal)
              : null,
          items: Array.isArray(src.ambiguityGaps.items)
            ? src.ambiguityGaps.items.slice(0, 20)
            : [],
        }
      : {
          ambiguousCount: null,
          expansionCount: 0,
          uncoveredCount: null,
          missingTotal: null,
          items: [],
        };

  const conflicts =
    src.conflicts && typeof src.conflicts === 'object'
      ? {
          conflictCount:
            src.conflicts.conflictCount != null
              ? Number(src.conflicts.conflictCount)
              : null,
          items: Array.isArray(src.conflicts.items)
            ? src.conflicts.items.slice(0, 20)
            : [],
        }
      : { conflictCount: null, items: [] };

  const out = {
    schemaVersion: INSIGHTS_SCHEMA_VERSION,
    understanding,
    quality: {
      coverageWeighted:
        factsQuality.coverageWeighted != null
          ? Number(factsQuality.coverageWeighted)
          : null,
      completenessScore:
        factsQuality.completenessScore != null
          ? Number(factsQuality.completenessScore)
          : null,
      gateAPassed:
        factsQuality.gateAPassed != null ? Boolean(factsQuality.gateAPassed) : null,
      summary: truncate(factsQuality.summary || '', 500),
    },
    ambiguityGaps,
    conflicts,
    businessImpact: {
      summary: truncate(src.businessImpact?.summary || '', 800),
      priority: src.businessImpact?.priority
        ? String(src.businessImpact.priority).trim()
        : null,
    },
    technicalImpact: {
      summary: truncate(src.technicalImpact?.summary || '', 800),
      platform: Array.isArray(src.technicalImpact?.platform)
        ? src.technicalImpact.platform.map(String).slice(0, 8)
        : [],
    },
    planningRelevance: {
      level: String(src.planningRelevance?.level || 'MEDIUM').trim() || 'MEDIUM',
      summary: truncate(src.planningRelevance?.summary || '', 500),
    },
    clarifications,
    evidence,
    meta: src.meta && typeof src.meta === 'object' ? { ...src.meta } : {},
  };

  out.meta.schema = INSIGHTS_SCHEMA_VERSION;
  return out;
}

function assertRequirementInsightsShape(insights) {
  const missing = REQUIRED_TOP_KEYS.filter((k) => insights?.[k] === undefined);
  if (missing.length) {
    const err = new Error(`requirementInsights missing keys: ${missing.join(',')}`);
    err.code = 'REQUIREMENT_INSIGHTS_SHAPE';
    throw err;
  }
  return true;
}

module.exports = {
  INSIGHTS_SCHEMA_VERSION,
  REQUIRED_TOP_KEYS,
  isRequirementInsightsEnabled,
  normalizeRequirementInsights,
  buildHeuristicRequirementInsights,
  assertRequirementInsightsShape,
  normalizeEvidenceItem,
  normalizeClarification,
};
