/**
 * Unit — G2 technical setup merge / complete gate (pure).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  mergeTechnicalSetup,
  isTechnicalSetupComplete,
  emptyTechnicalSetup,
} = require('../src/utils/technicalSetupFields');

describe('technicalSetupFields', () => {
  it('starts empty incomplete', () => {
    assert.equal(isTechnicalSetupComplete(emptyTechnicalSetup()), false);
  });

  it('merges repository and environments', () => {
    const r = mergeTechnicalSetup({}, {
      repository: { url: 'https://github.com/acme/app', provider: 'github', defaultBranch: 'main' },
      environments: [{ key: 'dev', name: 'Dev', url: 'https://dev.example' }],
    });
    assert.equal(r.ok, true);
    assert.equal(r.setup.repository.url, 'https://github.com/acme/app');
    assert.equal(r.setup.environments.length, 1);
    assert.equal(isTechnicalSetupComplete(r.setup), true);
  });

  it('rejects non-array environments', () => {
    const r = mergeTechnicalSetup({}, { environments: 'prod' });
    assert.equal(r.ok, false);
  });

  it('requires url + env for complete', () => {
    assert.equal(
      isTechnicalSetupComplete({
        repository: { url: 'https://x' },
        environments: [],
      }),
      false
    );
    assert.equal(
      isTechnicalSetupComplete({
        repository: { url: '' },
        environments: [{ key: 'dev', name: 'Dev', url: '' }],
      }),
      false
    );
  });

  it('maps unknown env key to custom', () => {
    const r = mergeTechnicalSetup({}, {
      environments: [{ key: 'qa', name: 'QA', url: 'https://qa' }],
    });
    assert.equal(r.ok, true);
    assert.equal(r.setup.environments[0].key, 'custom');
  });
});
