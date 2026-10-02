/**
 * Shared helpers for source-ingest Analysis engines (V1, no LLM).
 */

const {
  createEngineResult,
  noDataResult,
  failedResult,
  assertNoSrsDraftInEngineResult,
} = require('../contracts/analysisEngineContract');
const { normalizeProposalItem } = require('../contracts/proposalItem');
const { normalizeSourceRefs } = require('../contracts/evidenceRefs');

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * Resolve owned projection rows from EngineInput.
 * Supports: ownedSectionProjection.rows | .items | array projection | pack arrays.
 */
function resolveProjectionRows(input, packKeys = []) {
  const proj = input?.ownedSectionProjection;
  if (Array.isArray(proj)) return proj;
  if (proj && typeof proj === 'object') {
    if (proj.absent === true) return { absent: true, rows: [] };
    if (Array.isArray(proj.rows)) return { absent: false, rows: proj.rows, empty: proj.rows.length === 0 };
    if (Array.isArray(proj.items)) return { absent: false, rows: proj.items, empty: proj.items.length === 0 };
  }
  const pack = input?.context?.pack || input?.pack || {};
  for (const key of packKeys) {
    if (Array.isArray(pack[key]) && pack[key].length) {
      return { absent: false, rows: pack[key], empty: false };
    }
  }
  // Explicit empty array on pack key → sheet empty vs absent: treat as empty if key present
  for (const key of packKeys) {
    if (Object.prototype.hasOwnProperty.call(pack, key) && Array.isArray(pack[key])) {
      return { absent: false, rows: [], empty: true };
    }
  }
  return { absent: true, rows: [], empty: true };
}

function coverageReason(resolved) {
  if (resolved.absent) return 'SOURCE_SHEET_ABSENT';
  if (resolved.empty || !resolved.rows.length) return 'SOURCE_SHEET_EMPTY';
  return null;
}

/**
 * Generic source-ingest runner.
 * @param {{
 *   engineId: string,
 *   section: string,
 *   packKeys: string[],
 *   mapRow: (row: object, index: number) => object,
 *   input: object,
 * }} opts
 */
function runSourceIngestEngine(opts) {
  const meta = { engineId: opts.engineId, section: opts.section, version: 1 };
  try {
    const resolved = resolveProjectionRows(opts.input, opts.packKeys);
    if (!resolved.rows.length) {
      const result = noDataResult(meta, coverageReason(resolved) || 'SOURCE_UNAVAILABLE');
      assertNoSrsDraftInEngineResult(result);
      return result;
    }

    const warnings = [];
    const items = resolved.rows.map((row, i) => {
      const mapped = opts.mapRow(row, i) || {};
      const item = normalizeProposalItem(
        {
          ...mapped,
          sourceRefs: normalizeSourceRefs(mapped.sourceRefs || row.sourceRefs || []),
          origin: mapped.origin || { type: 'EXTRACTED', engine: opts.engineId, section: opts.section },
        },
        { index: i, engineId: opts.engineId, section: opts.section, defaultPrefix: opts.prefix || 'ITEM' }
      );
      if (!item.sourceRefs.length) {
        warnings.push({ code: 'MISSING_SOURCE_REFS', logicalId: item.logicalId });
      }
      return item;
    });

    const incomplete = items.filter((it) => !String(it.title || '').trim() || it.title === it.logicalId);
    const coverageStatus =
      warnings.length || incomplete.length ? 'PARTIAL' : 'AVAILABLE';

    const result = createEngineResult({
      items,
      coverage: {
        status: coverageStatus,
        reason: incomplete.length ? 'INCOMPLETE_SOURCE_FIELDS' : null,
        sourceStats: {
          sourceRows: resolved.rows.length,
          mappedRows: items.length,
          orphanRows: warnings.length,
        },
      },
      validation: { errors: [], warnings },
      meta,
    });
    assertNoSrsDraftInEngineResult(result);
    return result;
  } catch (err) {
    return failedResult(meta, [{ message: err.message, code: err.code || 'ENGINE_ERROR' }]);
  }
}

module.exports = {
  asArray,
  resolveProjectionRows,
  coverageReason,
  runSourceIngestEngine,
};
