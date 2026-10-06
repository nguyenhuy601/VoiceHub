/**
 * G2 System Supplement — runtime sourceManifest aligned with APS g2G3G6Deps.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  SOURCE_IDS,
  SOURCE_FIELD_MANIFEST,
} = require('../src/utils/aiAnalysis/pipeline/sourceManifest');
const {
  G2_SOURCE_IDS,
  G2_SOURCE_FIELD_MANIFEST,
} = require('../../ai-project-planning-service/src/knowledge/g2G3G6Deps');
const { resolveSources } = require('../src/utils/aiAnalysis/pipeline/resolveSources');

describe('g2SystemSupplementManifest', () => {
  it('runtime SOURCE_IDS includes project_history view', () => {
    assert.ok(SOURCE_IDS.includes('project_history'));
    assert.ok(G2_SOURCE_IDS.includes('project_history'));
  });

  it('project_history whitelist covers dual origins fields', () => {
    for (const key of ['role', 'domain', 'months', 'projectName', 'work', 'source', 'year']) {
      assert.ok(
        SOURCE_FIELD_MANIFEST.project_history.includes(key),
        `runtime missing ${key}`
      );
      assert.ok(
        G2_SOURCE_FIELD_MANIFEST.project_history.includes(key),
        `g2 missing ${key}`
      );
    }
  });

  it('employee_pool includes history and capacity fields in both manifests', () => {
    for (const key of ['history', 'projectCount', 'maxConcurrentProjects']) {
      assert.ok(SOURCE_FIELD_MANIFEST.employee_pool.includes(key));
      assert.ok(G2_SOURCE_FIELD_MANIFEST.employee_pool.includes(key));
    }
  });

  it('resolveSources lists project_history with employee_pool', () => {
    const ids = resolveSources({}).map((s) => s.id);
    assert.ok(ids.includes('employee_pool'));
    assert.ok(ids.includes('project_history'));
  });
});
