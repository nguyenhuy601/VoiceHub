/**
 * AssumptionEngine — lift CQ/gaps + Raw assumptions; classify ASSUMPTION | OPEN_QUESTION | BLOCKING_GAP.
 */

const {
  createEngineResult,
  noDataResult,
  failedResult,
  assertNoSrsDraftInEngineResult,
} = require('../contracts/analysisEngineContract');
const { normalizeProposalItem } = require('../contracts/proposalItem');
const { resolveProjectionRows } = require('./engineHelpers');

function classifyKind(row) {
  const raw = String(row.kind || row.type || row.classification || '').toUpperCase();
  if (['ASSUMPTION', 'OPEN_QUESTION', 'BLOCKING_GAP'].includes(raw)) return raw;
  if (row.blocking || raw === 'GAP') return 'BLOCKING_GAP';
  if (row.status === 'NEEDS_CONFIRMATION' || raw === 'QUESTION' || raw === 'CQ') {
    return 'OPEN_QUESTION';
  }
  return 'ASSUMPTION';
}

function run(input = {}) {
  const meta = { engineId: 'assumption', section: 'assumptions', version: 1 };
  try {
    const resolved = resolveProjectionRows(input, ['assumptions']);
    const fromRaw = resolved.rows.map((row, i) => ({
      logicalId: row.logicalId || row.id || `ASM-${i + 1}`,
      title: row.title || row.name || row.text || `Assumption ${i + 1}`,
      description: row.description || row.text || '',
      classification: classifyKind(row),
      sourceRefs: row.sourceRefs || [],
      origin: { type: 'EXTRACTED', engine: 'assumption', section: 'assumptions' },
      provenance: { type: 'EXTRACTED', derivedFrom: [], rule: null },
    }));

    const lifted = [];
    const dep = input.context?.dependencyResults || {};
    for (const result of Object.values(dep)) {
      for (const cq of result?.clarificationQuestions || []) {
        lifted.push({
          logicalId: cq.logicalId || cq.id || `CQ-LIFT-${lifted.length + 1}`,
          title: cq.message || cq.title || 'Open question',
          description: cq.message || '',
          classification: classifyKind({ ...cq, kind: 'OPEN_QUESTION' }),
          sourceRefs: cq.sourceRefs || [],
          origin: { type: 'DERIVED', engine: 'assumption', section: 'assumptions' },
          provenance: {
            type: 'DERIVED',
            derivedFrom: cq.requirementId ? [String(cq.requirementId)] : [],
            rule: 'LIFT_CLARIFICATION',
          },
        });
      }
    }

    const items = [...fromRaw, ...lifted].map((row, i) =>
      normalizeProposalItem(row, {
        index: i,
        engineId: 'assumption',
        section: 'assumptions',
        defaultPrefix: 'ASM',
      })
    );

    if (!items.length) {
      const gap = noDataResult(
        meta,
        resolved.absent ? 'SOURCE_SHEET_ABSENT' : 'SOURCE_UNAVAILABLE'
      );
      assertNoSrsDraftInEngineResult(gap);
      return gap;
    }

    const result = createEngineResult({
      items,
      coverage: {
        status: fromRaw.length ? 'AVAILABLE' : 'PARTIAL',
        reason: fromRaw.length ? null : 'LIFTED_FROM_CQ_ONLY',
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

module.exports = { id: 'assumption', section: 'assumptions', run };
