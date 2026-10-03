/**
 * Gate1 Wave A — revision hash + submission manifest (pure).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  hashRevisionContent,
  buildRevisionDoc,
  assertExpectedRevisionId,
  applyEditToContent,
  extractRevisionContent,
  ORIGIN_AI,
  ORIGIN_BA_EDIT,
} = require('../src/utils/srsProposal/artifactRevision');

const {
  hashRevisionManifest,
  normalizeRevisionManifest,
  buildGateSubmissionDoc,
  buildManifestFromDecisions,
} = require('../src/utils/srsProposal/gateSubmissionManifest');

describe('artifactRevision helpers', () => {
  it('contentHash is stable for same content', () => {
    const c = { logicalId: 'FR-1', title: 'A', description: 'd' };
    assert.equal(hashRevisionContent(c), hashRevisionContent({ ...c }));
  });

  it('contentHash changes when content changes', () => {
    const a = hashRevisionContent({ logicalId: 'FR-1', title: 'A' });
    const b = hashRevisionContent({ logicalId: 'FR-1', title: 'B' });
    assert.notEqual(a, b);
  });

  it('buildRevisionDoc sets parent and immutable hash', () => {
    const r1 = buildRevisionDoc({
      organizationId: 'org1',
      packId: 'pack1',
      artifactType: 'FR',
      logicalId: 'FR-1',
      section: 'functionalRequirements',
      revisionNo: 1,
      origin: ORIGIN_AI,
      content: { logicalId: 'FR-1', title: 'A' },
    });
    const edited = applyEditToContent(r1.content, { title: 'A clarified' });
    const r2 = buildRevisionDoc({
      organizationId: 'org1',
      packId: 'pack1',
      artifactType: 'FR',
      logicalId: 'FR-1',
      section: 'functionalRequirements',
      revisionNo: 2,
      parentRevisionId: r1.revisionId,
      origin: ORIGIN_BA_EDIT,
      content: edited,
    });
    assert.equal(r2.parentRevisionId, r1.revisionId);
    assert.equal(r2.revisionNo, 2);
    assert.notEqual(r2.contentHash, r1.contentHash);
    // r1 hash unchanged
    assert.equal(r1.contentHash, hashRevisionContent(r1.content));
  });

  it('assertExpectedRevisionId throws REVISION_CONFLICT', () => {
    assert.throws(
      () => assertExpectedRevisionId('REV-2', 'REV-1'),
      (err) => err.errorCode === 'REVISION_CONFLICT' && err.statusCode === 409
    );
    assert.doesNotThrow(() => assertExpectedRevisionId('REV-1', 'REV-1'));
    assert.doesNotThrow(() => assertExpectedRevisionId('REV-1', null));
  });

  it('extractRevisionContent drops noisy keys', () => {
    const c = extractRevisionContent({
      logicalId: 'FR-1',
      title: 'T',
      _internal: 1,
      meta: { x: 1 },
      sourceRefs: [{ ref: 'a' }],
    });
    assert.equal(c.title, 'T');
    assert.equal(c._internal, undefined);
    assert.equal(c.meta, undefined);
    assert.equal(c.sourceRefs.length, 1);
  });
});

describe('gateSubmissionManifest helpers', () => {
  it('normalize sorts by logicalId', () => {
    const n = normalizeRevisionManifest([
      { logicalId: 'FR-2', revisionId: 'R2', action: 'accept' },
      { logicalId: 'FR-1', revisionId: 'R1', action: 'edit' },
    ]);
    assert.equal(n[0].logicalId, 'FR-1');
    assert.equal(n[1].logicalId, 'FR-2');
  });

  it('manifestHash stable and sensitive to revision change', () => {
    const a = [
      { logicalId: 'FR-1', revisionId: 'REV-1', action: 'accept' },
      { logicalId: 'FR-2', revisionId: 'REV-A', action: 'edit' },
    ];
    const b = [
      { logicalId: 'FR-2', revisionId: 'REV-A', action: 'edit' },
      { logicalId: 'FR-1', revisionId: 'REV-1', action: 'accept' },
    ];
    assert.equal(hashRevisionManifest(a), hashRevisionManifest(b));
    const c = [
      { logicalId: 'FR-1', revisionId: 'REV-2', action: 'accept' },
      { logicalId: 'FR-2', revisionId: 'REV-A', action: 'edit' },
    ];
    assert.notEqual(hashRevisionManifest(a), hashRevisionManifest(c));
  });

  it('buildGateSubmissionDoc includes manifestHash', () => {
    const doc = buildGateSubmissionDoc({
      organizationId: 'o1',
      packId: 'p1',
      reviewId: 'G1-REV-1',
      sequenceNo: 1,
      revisionManifest: [{ logicalId: 'FR-1', revisionId: 'REV-1', action: 'accept' }],
      submittedBy: 'u1',
    });
    assert.ok(doc.submissionId.startsWith('SUB-'));
    assert.equal(doc.manifestHash, hashRevisionManifest(doc.revisionManifest));
  });

  it('buildManifestFromDecisions uses decision.revisionId', () => {
    const m = buildManifestFromDecisions({
      'FR-1': { action: 'accept', revisionId: 'REV-9' },
      'FR-2': { action: 'edit' },
    }, { 'FR-2': 'REV-tip' });
    assert.equal(m.length, 2);
    assert.equal(m.find((x) => x.logicalId === 'FR-1').revisionId, 'REV-9');
    assert.equal(m.find((x) => x.logicalId === 'FR-2').revisionId, 'REV-tip');
  });
});
