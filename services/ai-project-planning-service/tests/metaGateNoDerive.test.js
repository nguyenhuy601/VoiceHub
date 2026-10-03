/**
 * Step 1 — metaGate must not produce derive; derive is a separate node.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  runMetaGateNode,
  runDeriveRawSectionsNode,
  DERIVE_NODE_ID,
  META_GATE_NODE_ID,
  listAnalysisGraphNodeIds,
} = require('../src/orchestration/analysisEngineNodes');
const { runMetaGate } = require('../src/srsProposal/metaGate');

describe('metaGate vs derive separation', () => {
  it('graph id list includes deriveRawSections before metaGate conceptually', () => {
    const ids = listAnalysisGraphNodeIds();
    assert.ok(ids.includes(DERIVE_NODE_ID));
    assert.ok(ids.includes(META_GATE_NODE_ID));
    assert.ok(ids.indexOf(DERIVE_NODE_ID) < ids.indexOf(META_GATE_NODE_ID));
  });

  it('runMetaGateNode source does not call applyRawSectionDerive', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/orchestration/analysisEngineNodes.js'),
      'utf8'
    );
    const metaFn = src.slice(src.indexOf('async function runMetaGateNode'));
    const metaBody = metaFn.slice(0, metaFn.indexOf('async function attachAnalysisEngineNodes'));
    assert.equal(metaBody.includes('applyRawSectionDerive'), false);
    assert.ok(metaBody.includes('runMetaGate('));
  });

  it('runMetaGate pure helper has no LLM/derive imports', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/srsProposal/metaGate.js'),
      'utf8'
    );
    assert.equal(src.includes('applyRawSectionDerive'), false);
    assert.equal(src.includes('runRawSectionDerive'), false);
    assert.equal(src.includes('ollama'), false);
  });

  it('runMetaGateNode only stamps readiness on existing proposal', async () => {
    const out = await runMetaGateNode({
      runId: 'test-run',
      srsProposal: null,
      proposalFragment: {
        section: 'functionalRequirements',
        items: [
          {
            logicalId: 'CR-1',
            title: 'T',
            origin: { type: 'EXTRACTED' },
            provenance: { type: 'EXTRACTED', producer: 'test', rule: 'T', derivedFrom: [] },
          },
        ],
        meta: { generationId: 'g1', engineId: 'fr' },
      },
      pack: {},
      engineResultsById: {},
      history: [],
    });
    assert.ok(out.srsProposal);
    assert.ok(out.history.includes(META_GATE_NODE_ID));
    assert.equal(out.history.includes(DERIVE_NODE_ID), false);
    assert.equal(typeof out.srsProposal.completeness?.readyForGate1, 'boolean');
  });

  it('runDeriveRawSectionsNode is the only producer of deriveStatuses merge', async () => {
    const out = await runDeriveRawSectionsNode({
      pack: {
        functionalRequirements: [],
        aiAnalysis: { formValidation: { ok: false } },
      },
      srsProposal: null,
      engineResultsById: {},
      history: [],
      env: { PHASE1_RAW_SECTION_DERIVE: '0' },
    });
    assert.ok(out.history.includes(DERIVE_NODE_ID));
  });

  it('runMetaGate still works standalone', () => {
    const proposal = runMetaGate({
      generated: {
        functionalRequirements: {
          items: [
            {
              logicalId: 'CR-1',
              title: 'T',
              origin: { type: 'EXTRACTED' },
              provenance: { type: 'EXTRACTED', producer: 't', rule: 't', derivedFrom: [] },
            },
          ],
        },
      },
      completeness: {},
      meta: {},
    });
    assert.ok(proposal.completeness);
    assert.ok(Array.isArray(proposal.completeness.sectionReviews));
    assert.equal(proposal.completeness.gateDecision.decision, 'READY');
    assert.equal(proposal.meta.gateDecision.decision, 'READY');
    assert.ok(proposal.completeness.gateDecision.coverage.FR >= 1);
  });

  it('runMetaGate NOT_READY when FR empty', () => {
    const proposal = runMetaGate({
      generated: { functionalRequirements: { items: [] } },
      completeness: {},
      meta: {},
    });
    assert.equal(proposal.completeness.gateDecision.decision, 'NOT_READY');
    assert.ok(proposal.completeness.gateDecision.blockingIssues.length >= 1);
  });
});
