/**
 * Stamp origin/provenance on Proposal items (RULE-PROVENANCE-01).
 */

const { normalizeProposalItem } = require('../srsProposal/contracts/proposalItem');

const PRODUCERS = Object.freeze({
  DETERMINISTIC: 'deterministic',
  HEURISTIC: 'heuristic_rule',
  SEMANTIC_RUNTIME: 'semantic_runtime',
});

/**
 * @param {object} item
 * @param {{
 *   engineId: string,
 *   section: string,
 *   originType: string,
 *   producer: string,
 *   rule?: string|null,
 *   derivedFrom?: string[],
 *   index?: number,
 *   defaultPrefix?: string,
 * }} stamp
 */
function stampProposalItem(item, stamp) {
  const originType = String(stamp.originType || 'EXTRACTED').toUpperCase();
  const producer =
    stamp.producer ||
    (originType === 'AI_SYNTHESIS'
      ? PRODUCERS.SEMANTIC_RUNTIME
      : originType === 'HEURISTIC'
        ? PRODUCERS.HEURISTIC
        : PRODUCERS.DETERMINISTIC);

  return normalizeProposalItem(
    {
      ...item,
      origin: {
        type: originType,
        engine: stamp.engineId,
        section: stamp.section,
      },
      provenance: {
        type: originType,
        derivedFrom: Array.isArray(stamp.derivedFrom) ? stamp.derivedFrom.map(String) : [],
        rule: stamp.rule != null ? stamp.rule : null,
        producer,
      },
    },
    {
      index: stamp.index ?? 0,
      engineId: stamp.engineId,
      section: stamp.section,
      defaultPrefix: stamp.defaultPrefix || 'ITEM',
    }
  );
}

function stampExtracted(item, opts) {
  return stampProposalItem(item, {
    ...opts,
    originType: 'EXTRACTED',
    producer: PRODUCERS.DETERMINISTIC,
    rule: opts.rule || 'SOURCE_INGEST',
  });
}

function stampHeuristic(item, opts) {
  return stampProposalItem(item, {
    ...opts,
    originType: 'HEURISTIC',
    producer: PRODUCERS.HEURISTIC,
    rule: opts.rule || 'HEURISTIC',
  });
}

function stampAiSynthesis(item, opts) {
  return stampProposalItem(item, {
    ...opts,
    originType: 'AI_SYNTHESIS',
    producer: PRODUCERS.SEMANTIC_RUNTIME,
    rule: opts.rule || opts.taskId || 'semantic',
  });
}

function stampDerived(item, opts) {
  return stampProposalItem(item, {
    ...opts,
    originType: 'DERIVED',
    producer: PRODUCERS.DETERMINISTIC,
    rule: opts.rule || 'DERIVED',
  });
}

module.exports = {
  PRODUCERS,
  stampProposalItem,
  stampExtracted,
  stampHeuristic,
  stampAiSynthesis,
  stampDerived,
};
