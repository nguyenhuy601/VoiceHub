const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { normalizeDeployEvidence } = require('../src/utils/work/normalizeDeployEvidence');

describe('normalizeDeployEvidence (Plan D E5)', () => {
  it('defaults env to production and stamps user', () => {
    const r = normalizeDeployEvidence({ notes: 'smoke ok' }, { userId: 'abc123', releaseLabel: 'REL-1' });
    assert.equal(r.env, 'production');
    assert.equal(r.notes, 'smoke ok');
    assert.equal(r.byUserId, 'abc123');
    assert.equal(r.releaseLabelRef, 'REL-1');
    assert.ok(r.at instanceof Date);
    assert.equal(r.pipelineUrl, '');
  });

  it('keeps http(s) pipelineUrl and drops unsafe', () => {
    const ok = normalizeDeployEvidence({ pipelineUrl: 'https://ci.example/job/1' });
    assert.equal(ok.pipelineUrl, 'https://ci.example/job/1');
    const bad = normalizeDeployEvidence({ pipelineUrl: 'javascript:alert(1)' });
    assert.equal(bad.pipelineUrl, '');
  });
});
