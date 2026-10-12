/**
 * Advisory Gate A signals — duplicates (AI/FR) + missing Gate1 sections (NO_DATA).
 * Pure helpers; no Mongo.
 */

const { computeGate1Readiness } = require('../srsProposal/gate1ReadinessPolicy');

function normTitle(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function listFrItems(pack, aiAnalysis) {
  const analyses = aiAnalysis?.analyses || pack?.aiAnalysis?.analyses || {};
  const proposalFr =
    analyses.srsProposal?.generated?.functionalRequirements?.items ||
    analyses.proposedSrs?.functionalRequirements ||
    [];
  if (Array.isArray(proposalFr) && proposalFr.length) return proposalFr;
  if (Array.isArray(pack?.functionalRequirements)) return pack.functionalRequirements;
  return [];
}

/**
 * Exact FR id duplicates + identical normalized titles (no semantic LLM).
 * Also merges G4 normalize duplicate ids when present.
 */
function collectDuplicateSignals({ pack, aiAnalysis } = {}) {
  const analyses = aiAnalysis?.analyses || pack?.aiAnalysis?.analyses || {};
  const g4Dupes = analyses.g4Understanding?.duplicates;
  const fromG4 = Array.isArray(g4Dupes) ? g4Dupes.map((id) => String(id)) : [];

  const items = listFrItems(pack, aiAnalysis);
  const byId = new Map();
  const byTitle = new Map();
  const duplicateIds = new Set(fromG4.filter(Boolean));
  const duplicateTitles = [];

  for (let i = 0; i < items.length; i += 1) {
    const row = items[i] || {};
    const id = String(row.externalId || row.id || row._id || '').trim();
    if (id) {
      if (byId.has(id)) duplicateIds.add(id);
      else byId.set(id, i);
    }
    const title = normTitle(row.title || row.name);
    if (title.length >= 3) {
      if (byTitle.has(title)) {
        duplicateTitles.push({ title, left: byTitle.get(title), right: id || `idx:${i}` });
      } else {
        byTitle.set(title, id || `idx:${i}`);
      }
    }
  }

  const count = duplicateIds.size + duplicateTitles.length;
  return {
    count,
    duplicateIds: [...duplicateIds],
    duplicateTitles,
  };
}

/**
 * Gate1 soft gaps / sectionReviews NO_DATA (not FR-field completeness).
 */
function collectMissingSectionSignals({ pack, aiAnalysis } = {}) {
  const analyses = aiAnalysis?.analyses || pack?.aiAnalysis?.analyses || {};
  const proposal =
    analyses.srsProposal ||
    analyses.proposedSrs ||
    pack?.aiAnalysis?.analyses?.srsProposal ||
    null;

  const sectionReviews = Array.isArray(proposal?.completeness?.sectionReviews)
    ? proposal.completeness.sectionReviews
    : Array.isArray(analyses.srsProposal?.completeness?.sectionReviews)
      ? analyses.srsProposal.completeness.sectionReviews
      : [];

  const readiness = computeGate1Readiness(proposal || { generated: {} }, { sectionReviews });
  const softGaps = Array.isArray(readiness.softGaps) ? readiness.softGaps : [];

  const fromReviews = [];
  for (const rev of sectionReviews) {
    const status = String(rev?.coverage?.status || rev?.status || '').toUpperCase();
    if (status === 'NO_DATA' || status === 'EMPTY') {
      fromReviews.push({
        section: String(rev.section || ''),
        reason: String(rev?.coverage?.reason || status),
      });
    }
  }

  const bySection = new Map();
  for (const gap of [...softGaps, ...fromReviews]) {
    const key = String(gap.section || '').trim();
    if (!key || key === 'functionalRequirements') continue;
    if (!bySection.has(key)) bySection.set(key, gap);
  }

  const sections = [...bySection.values()];
  return {
    count: sections.length,
    sections,
  };
}

/**
 * @returns {{ duplicateCount: number, missingSections: object[], duplicateDetail: object }}
 */
function collectGateAAdvisorySignals({ pack, aiAnalysis, snapshot } = {}) {
  void snapshot;
  const dup = collectDuplicateSignals({ pack, aiAnalysis });
  const miss = collectMissingSectionSignals({ pack, aiAnalysis });
  return {
    duplicateCount: dup.count,
    missingSections: miss.sections,
    duplicateDetail: {
      duplicateIds: dup.duplicateIds,
      duplicateTitles: dup.duplicateTitles,
    },
  };
}

/**
 * Merge advisory signal checks into an existing Gate A data object.
 */
function applyAdvisorySignalsToGateA(gateA, signals = {}) {
  const base = gateA && typeof gateA === 'object' ? { ...gateA } : {};
  const checks = Array.isArray(base.checks) ? [...base.checks] : [];
  const without = checks.filter(
    (c) => c && c.id !== 'duplicates' && c.id !== 'missing_sections' && c.id !== 'coverage'
  );

  const duplicateCount = Number(signals.duplicateCount || 0);
  const missingSections = Array.isArray(signals.missingSections) ? signals.missingSections : [];

  without.push({
    id: 'duplicates',
    passed: duplicateCount === 0,
    value: duplicateCount,
    threshold: 0,
    detail: signals.duplicateDetail || null,
  });
  without.push({
    id: 'missing_sections',
    passed: missingSections.length === 0,
    value: missingSections.length,
    threshold: 0,
    detail: missingSections,
  });

  // Coverage kept as informational only (never fails advisory overall for enforce-off UX).
  if (base.checks?.some((c) => c?.id === 'coverage')) {
    const cov = base.checks.find((c) => c?.id === 'coverage');
    without.push({
      ...cov,
      id: 'coverage',
      skipped: true,
      advisory: true,
      passed: true,
    });
  }

  const warningChecks = without.filter((c) => c && !c.skipped && c.passed === false);
  return {
    ...base,
    mode: 'advisory',
    checks: without,
    hasWarnings: warningChecks.length > 0,
    passed: warningChecks.length === 0,
    thresholds: { ...(base.thresholds || {}), advisory: true },
  };
}

module.exports = {
  normTitle,
  collectDuplicateSignals,
  collectMissingSectionSignals,
  collectGateAAdvisorySignals,
  applyAdvisorySignalsToGateA,
};
