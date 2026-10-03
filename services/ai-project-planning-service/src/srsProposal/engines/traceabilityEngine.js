/**
 * TraceabilityEngine — CROSS_CUTTING, post-analysis.
 * Maps Raw ↔ Analysis; detects orphans / invalid sourceRefs. Does not mutate domain sections.
 */

const {
  createEngineResult,
  noDataResult,
  failedResult,
  assertNoSrsDraftInEngineResult,
} = require('../contracts/analysisEngineContract');
const { normalizeProposalItem } = require('../contracts/proposalItem');
const { normalizeSourceRefs } = require('../contracts/evidenceRefs');

function run(input = {}) {
  const meta = { engineId: 'traceability', section: 'traceability', version: 1 };
  try {
    const dep = input.context?.dependencyResults || {};
    const rawRows = Array.isArray(input.ownedSectionProjection?.rawRows)
      ? input.ownedSectionProjection.rawRows
      : Array.isArray(input.context?.rawRows)
        ? input.context.rawRows
        : [];

    const links = [];
    const analysisIds = new Set();
    const referencedRaw = new Set();
    const warnings = [];

    for (const result of Object.values(dep)) {
      const section = result?.meta?.section;
      if (!section || section === 'traceability') continue;
      for (const it of result.items || []) {
        const logicalId = String(it.logicalId || it.id || '');
        if (!logicalId) continue;
        analysisIds.add(logicalId);
        const refs = normalizeSourceRefs(it.sourceRefs || []);
        if (!refs.length && !(it.provenance?.derivedFrom || []).length) {
          warnings.push({ code: 'ORPHAN_ANALYSIS_ITEM', logicalId, section });
        }
        for (const ref of refs) {
          const rawKey = [ref.documentId, ref.sheet, ref.row].filter((x) => x != null).join(':');
          if (rawKey) referencedRaw.add(rawKey);
          links.push({
            logicalId: `TR-${logicalId}-${links.length + 1}`,
            title: `${logicalId} ← source`,
            analysisId: logicalId,
            section,
            sourceRefs: [ref],
            origin: { type: 'NORMALIZED', engine: 'traceability', section: 'traceability' },
            provenance: { type: 'DERIVED', derivedFrom: [logicalId], rule: 'TRACE_LINK' },
          });
        }
        for (const up of it.provenance?.derivedFrom || []) {
          links.push({
            logicalId: `TR-${logicalId}-UP-${up}`,
            title: `${logicalId} ← ${up}`,
            analysisId: logicalId,
            upstreamId: String(up),
            section,
            sourceRefs: [],
            origin: { type: 'DERIVED', engine: 'traceability', section: 'traceability' },
            provenance: {
              type: 'DERIVED',
              derivedFrom: [logicalId, String(up)],
              rule: 'TRACE_UPSTREAM',
            },
          });
        }
      }
    }

    for (const row of rawRows) {
      const rawKey = [row.documentId || row.sourceId, row.sheet, row.row ?? row.rowId]
        .filter((x) => x != null)
        .join(':');
      if (rawKey && !referencedRaw.has(rawKey)) {
        warnings.push({ code: 'ORPHAN_RAW_SOURCE', rawKey });
      }
    }

    const items = links.map((row, i) =>
      normalizeProposalItem(row, {
        index: i,
        engineId: 'traceability',
        section: 'traceability',
        defaultPrefix: 'TR',
      })
    );

    if (!items.length && !analysisIds.size) {
      const gap = noDataResult(meta, 'SOURCE_UNAVAILABLE');
      assertNoSrsDraftInEngineResult(gap);
      return gap;
    }

    const result = createEngineResult({
      items,
      coverage: {
        status: warnings.length ? 'PARTIAL' : items.length ? 'AVAILABLE' : 'PARTIAL',
        reason: warnings.length ? 'TRACE_GAPS' : null,
        sourceStats: {
          sourceRows: rawRows.length,
          mappedRows: items.length,
          orphanRows: warnings.filter((w) => w.code === 'ORPHAN_RAW_SOURCE').length,
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

module.exports = { id: 'traceability', section: 'traceability', run };
