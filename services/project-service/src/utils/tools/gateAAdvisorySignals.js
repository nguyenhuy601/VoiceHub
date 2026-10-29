/**
 * Advisory Gate A signals — duplicates (AI/FR) + missing Gate1 sections (NO_DATA).
 * Pure helpers; no Mongo.
 *
 * Source-absence (empty/absent Excel sheet) is NOT "AI thiếu đề xuất" — those stay on
 * section tabs (Gate1MissingSectionPanel), not Gate A missing_sections warnings.
 */

const { computeGate1Readiness } = require('../srsProposal/gate1ReadinessPolicy');

/** Workbook/extract could not supply rows — expected soft note, not Gate A content gap. */
const SOURCE_ABSENCE_REASONS = new Set([
  'SOURCE_SHEET_EMPTY',
  'SOURCE_SHEET_ABSENT',
  'SOURCE_UNAVAILABLE',
  'INTAKE_SOURCE_UNAVAILABLE',
]);

function isSourceAbsenceReason(reason) {
  return SOURCE_ABSENCE_REASONS.has(String(reason || '').trim().toUpperCase());
}

/**
 * Drop sheet-empty / source-unavailable rows from Gate A missing_sections payloads
 * (collect, runGateA, apply, stale snapshots).
 */
function filterContentMissingSections(missingSections = []) {
  const list = Array.isArray(missingSections) ? missingSections : [];
  return list.filter((row) => {
    if (!row || typeof row !== 'object') return false;
    const section = String(row.section || '').trim();
    if (!section) return false;
    return !isSourceAbsenceReason(row.reason);
  });
}

function sanitizeMissingSectionsCheck(check) {
  if (!check || check.id !== 'missing_sections') return check;
  const detail = filterContentMissingSections(check.detail);
  const message = formatMissingSectionsMessage(detail);
  const next = {
    ...check,
    detail,
    value: detail.length,
    passed: detail.length === 0,
    threshold: check.threshold ?? 0,
  };
  if (message) next.message = message;
  else delete next.message;
  return next;
}

/** Recompute Gate A passed/hasWarnings after stripping source-absence from missing_sections. */
function sanitizeGateAForSourceAbsence(gateA) {
  if (!gateA || typeof gateA !== 'object') return gateA;
  const checks = Array.isArray(gateA.checks)
    ? gateA.checks.map((c) =>
        c?.id === 'missing_sections' ? sanitizeMissingSectionsCheck(c) : c
      )
    : [];
  const warningChecks = checks.filter((c) => c && !c.skipped && c.passed === false);
  return {
    ...gateA,
    checks,
    hasWarnings: warningChecks.length > 0,
    passed: warningChecks.length === 0,
  };
}

function sectionHasProposalItems(generated, section) {
  const items = generated?.[section]?.items;
  return Array.isArray(items) && items.length > 0;
}

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
 */
function collectDuplicateSignals({ pack, aiAnalysis } = {}) {
  const items = listFrItems(pack, aiAnalysis);
  const byId = new Map();
  const byTitle = new Map();
  const duplicateIds = new Set();
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
 * Gate1 content gaps for Gate A advisory (not FR-field completeness).
 * Skips source-absence reasons and sections that already have proposal items.
 */
function collectMissingSectionSignals({ pack, aiAnalysis } = {}) {
  const analyses = aiAnalysis?.analyses || pack?.aiAnalysis?.analyses || {};
  const proposal =
    analyses.srsProposal ||
    analyses.proposedSrs ||
    pack?.aiAnalysis?.analyses?.srsProposal ||
    null;

  const generated = proposal?.generated || {};
  const sectionReviews = Array.isArray(proposal?.completeness?.sectionReviews)
    ? proposal.completeness.sectionReviews
    : Array.isArray(analyses.srsProposal?.completeness?.sectionReviews)
      ? analyses.srsProposal.completeness.sectionReviews
      : [];

  const readiness = computeGate1Readiness(proposal || { generated: {} }, { sectionReviews });
  const softGaps = Array.isArray(readiness.softGaps) ? readiness.softGaps : [];

  const fromReviews = [];
  for (const rev of sectionReviews) {
    const section = String(rev?.section || '').trim();
    if (!section || sectionHasProposalItems(generated, section)) continue;

    // Prefer review status (EMPTY/NO_DATA when no items). Do not treat
    // coverage.status=NO_DATA alone when items exist — that is source metadata.
    const reviewStatus = String(rev?.status || '').toUpperCase();
    const covStatus = String(rev?.coverage?.status || '').toUpperCase();
    const isEmptyReview =
      reviewStatus === 'NO_DATA' ||
      reviewStatus === 'EMPTY' ||
      (!reviewStatus && (covStatus === 'NO_DATA' || covStatus === 'EMPTY'));
    if (!isEmptyReview) continue;

    const reason = String(rev?.coverage?.reason || reviewStatus || covStatus || 'NO_DATA');
    if (isSourceAbsenceReason(reason)) continue;

    fromReviews.push({ section, reason });
  }

  const reasonBySection = new Map();
  for (const rev of sectionReviews) {
    const key = String(rev?.section || '').trim();
    const reason = String(rev?.coverage?.reason || '').trim();
    if (key && reason) reasonBySection.set(key, reason);
  }

  const bySection = new Map();
  for (const gap of [...softGaps, ...fromReviews]) {
    const key = String(gap.section || '').trim();
    if (!key || key === 'functionalRequirements') continue;
    if (sectionHasProposalItems(generated, key)) continue;
    const reason = String(gap.reason || reasonBySection.get(key) || '').trim();
    if (isSourceAbsenceReason(reason)) continue;
    if (!bySection.has(key)) {
      bySection.set(key, reason && reason !== String(gap.reason || '') ? { ...gap, reason } : gap);
    }
  }

  const sections = [...bySection.values()];
  return {
    count: sections.length,
    sections,
  };
}

/**
 * Human-readable summary of missing section/column gaps (Gate A advisory).
 * @param {Array<{ section?: string, reason?: string }>} missingSections
 * @returns {string}
 */
function formatMissingSectionsMessage(missingSections = []) {
  const list = filterContentMissingSections(missingSections);
  if (list.length === 0) return '';
  const parts = list
    .map((row) => {
      const section = String(row?.section || '').trim();
      if (!section) return '';
      const reason = String(row?.reason || '').trim();
      return reason ? `${section} (${reason})` : section;
    })
    .filter(Boolean);
  if (parts.length === 0) return '';
  return `Thiếu dữ liệu cột/section: ${parts.join(', ')}`;
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
  const missingSections = filterContentMissingSections(signals.missingSections);
  const missingMessage = formatMissingSectionsMessage(missingSections);

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
    ...(missingMessage ? { message: missingMessage } : {}),
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

  return sanitizeGateAForSourceAbsence({
    ...base,
    mode: 'advisory',
    checks: without,
    thresholds: { ...(base.thresholds || {}), advisory: true },
  });
}

module.exports = {
  normTitle,
  SOURCE_ABSENCE_REASONS,
  isSourceAbsenceReason,
  filterContentMissingSections,
  sanitizeMissingSectionsCheck,
  sanitizeGateAForSourceAbsence,
  collectDuplicateSignals,
  collectMissingSectionSignals,
  formatMissingSectionsMessage,
  collectGateAAdvisorySignals,
  applyAdvisorySignalsToGateA,
};
