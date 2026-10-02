/**
 * Data Lineage P0 — analysis section projection + source identity.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  REQUIRED_PROJECTED_SRS_SECTIONS,
  projectAllAnalysisSections,
  projectAnalysisSection,
  hasRequiredProjectedSrsSections,
} = require('../src/utils/aiAnalysis/pipeline/projectAnalysisSections');
const { projectAllSources } = require('../src/utils/aiAnalysis/pipeline/fieldProjection');
const { buildSnapshotPayload } = require('../src/utils/aiAnalysis/pipeline/buildPipeline');
const { PIPELINE_VERSION } = require('../src/utils/aiAnalysis/pipeline/pipelineConstants');

describe('projectAnalysisSections', () => {
  it('projects BG/UC with source identity fields', () => {
    const pack = {
      businessGoals: [{ externalId: 'BG-1', goal: 'Grow revenue', description: 'Q1' }],
      useCases: [{ externalId: 'UC-1', name: 'Login', description: 'User logs in' }],
      dataEntities: [{ name: 'Employee', description: 'HR entity' }],
    };
    const bg = projectAnalysisSection(pack, 'businessGoals');
    assert.equal(bg.length, 1);
    assert.equal(bg[0].externalId, 'BG-1');
    assert.equal(bg[0].section, 'businessGoals');
    assert.ok(bg[0].sourceSheet);
    assert.ok(bg[0].sourceRowId);
    assert.ok(bg[0].contentHash);
    assert.equal(bg[0].stableId, 'BG-1');

    const all = projectAllAnalysisSections(pack);
    assert.equal(all.useCases[0].externalId, 'UC-1');
    assert.equal(all.entities[0].name, 'Employee');
    assert.ok(Array.isArray(all.businessRules));
    assert.equal(all.businessRules.length, 0);
  });

  it('projectAllSources includes all required srs section keys', () => {
    const projected = projectAllSources({
      pack: {
        functionalRequirements: [{ externalId: 'FR-1', name: 'A', description: 'd' }],
        nonFunctionalRequirements: [],
        businessGoals: [{ externalId: 'BG-1', goal: 'G' }],
      },
      poolItems: [],
      calendar: {},
      skillCatalog: {},
    });
    assert.ok(hasRequiredProjectedSrsSections(projected.srs));
    for (const key of REQUIRED_PROJECTED_SRS_SECTIONS) {
      assert.ok(Array.isArray(projected.srs[key]), `missing ${key}`);
    }
    assert.equal(projected.srs.functionalRequirements[0].section, 'functionalRequirements');
    assert.ok(projected.srs.functionalRequirements[0].contentHash);
  });

  it('buildSnapshotPayload pins pipelineVersion and required sections', () => {
    const payload = buildSnapshotPayload({
      pack: {
        versionNumber: 1,
        functionalRequirements: [{ externalId: 'FR-1', name: 'A', description: 'd' }],
        nonFunctionalRequirements: [],
        useCases: [{ externalId: 'UC-9', name: 'Search' }],
      },
      poolItems: [],
      calendar: {},
      skillCatalog: {},
      packContentHash: 'abc',
    });
    assert.equal(payload.pipelineVersion, PIPELINE_VERSION);
    assert.ok(hasRequiredProjectedSrsSections(payload.projected.srs));
    assert.equal(payload.projected.srs.useCases[0].externalId, 'UC-9');
  });
});
