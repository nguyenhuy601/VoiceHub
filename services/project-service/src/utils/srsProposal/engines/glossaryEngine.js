/**
 * GlossaryEngine — collect Raw glossary rows + terms from existing Analysis items.
 */

const {
  createEngineResult,
  noDataResult,
  failedResult,
  assertNoSrsDraftInEngineResult,
} = require('../contracts/analysisEngineContract');
const { normalizeProposalItem } = require('../contracts/proposalItem');
const { resolveProjectionRows } = require('./engineHelpers');

function termsFromItems(fragments = {}) {
  const terms = [];
  for (const [section, block] of Object.entries(fragments)) {
    for (const it of block?.items || []) {
      const title = String(it.title || it.name || '').trim();
      if (title && title.length >= 2 && title.length <= 64) {
        terms.push({
          term: title,
          section,
          logicalId: it.logicalId,
          sourceRefs: it.sourceRefs || [],
        });
      }
    }
  }
  return terms;
}

function run(input = {}) {
  const meta = { engineId: 'glossary', section: 'glossary', version: 1 };
  try {
    const resolved = resolveProjectionRows(input, ['glossary', 'glossaryTerms']);
    const fromRaw = resolved.rows.map((row, i) => ({
      logicalId: row.logicalId || row.id || `GLOSS-${i + 1}`,
      title: row.term || row.title || row.name || `Term ${i + 1}`,
      description: row.definition || row.description || '',
      sourceRefs: row.sourceRefs || [],
      origin: { type: 'EXTRACTED', engine: 'glossary', section: 'glossary' },
      provenance: { type: 'EXTRACTED', derivedFrom: [], rule: null },
    }));

    const upstream = input.upstreamFragments || input.context?.dependencyResults || {};
    const fragMap = {};
    for (const [k, v] of Object.entries(upstream)) {
      if (v?.items) fragMap[k] = v;
      else if (v?.section && v?.items) fragMap[v.section] = v;
    }
    // Also accept dependencyResults keyed by engine id
    const bySection = { ...fragMap };
    for (const [engineId, result] of Object.entries(input.context?.dependencyResults || {})) {
      if (result?.meta?.section && Array.isArray(result.items)) {
        bySection[result.meta.section] = result;
      }
    }

    const collected = termsFromItems(bySection);
    const seen = new Set(fromRaw.map((t) => String(t.title).toLowerCase()));
    const fromItems = [];
    let idx = fromRaw.length;
    for (const t of collected) {
      const key = t.term.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      idx += 1;
      fromItems.push({
        logicalId: `GLOSS-COLLECT-${idx}`,
        title: t.term,
        description: '',
        sourceRefs: t.sourceRefs || [],
        origin: { type: 'NORMALIZED', engine: 'glossary', section: 'glossary' },
        provenance: {
          type: 'DERIVED',
          derivedFrom: t.logicalId ? [String(t.logicalId)] : [],
          rule: 'GLOSSARY_COLLECT',
        },
      });
    }

    const items = [...fromRaw, ...fromItems].map((row, i) =>
      normalizeProposalItem(row, {
        index: i,
        engineId: 'glossary',
        section: 'glossary',
        defaultPrefix: 'GLOSS',
      })
    );

    if (!items.length) {
      const gap = noDataResult(meta, coverageReason(resolved));
      assertNoSrsDraftInEngineResult(gap);
      return gap;
    }

    const result = createEngineResult({
      items,
      coverage: {
        status: fromRaw.length ? 'AVAILABLE' : 'PARTIAL',
        reason: fromRaw.length ? null : 'COLLECTED_FROM_ITEMS_ONLY',
        sourceStats: {
          sourceRows: resolved.rows.length,
          mappedRows: items.length,
          orphanRows: 0,
        },
      },
      validation: { errors: [], warnings: [] },
      meta,
    });
    assertNoSrsDraftInEngineResult(result);
    return result;
  } catch (err) {
    return failedResult(meta, [{ message: err.message, code: err.code || 'ENGINE_ERROR' }]);
  }
}

function coverageReason(resolved) {
  if (resolved.absent) return 'SOURCE_SHEET_ABSENT';
  return 'SOURCE_UNAVAILABLE';
}

module.exports = { id: 'glossary', section: 'glossary', run };
