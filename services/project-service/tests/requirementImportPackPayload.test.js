const path = require('path');
const Module = require('module');
// shared/config/mongo resolves mongoose from shared/; point NODE_PATH at this service first.
const serviceNodeModules = path.join(__dirname, '..', 'node_modules');
process.env.NODE_PATH = [serviceNodeModules, process.env.NODE_PATH || '']
  .filter(Boolean)
  .join(path.delimiter);
Module._initPaths();

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { mapParsedToPackPayload } = require('../src/utils/requirement/mapParsedToPackPayload');

describe('mapParsedToPackPayload analysis extras', () => {
  it('keeps Scope CR/source/date/status/baNote for seed', () => {
    const payload = mapParsedToPackPayload({
      isRequirementAnalysis: true,
      overview: { requirementName: 'VTXK', projectObjective: 'Obj', businessScope: 'Scope' },
      scope: [
        {
          type: 'in',
          description: 'SSO Entra ID',
          source: 'Workshop',
          dateRaised: '2026-09-15',
          status: 'Draft',
          baNote: 'Analyzed:2026-09-22',
          customerRequirementIds: ['CR-001'],
        },
      ],
      functionalRequirements: [],
      nonFunctionalRequirements: [],
      assumptions: [
        {
          externalId: 'ASM-001',
          text: 'Entra groups mapped',
          impactIfInvalid: 'No SSO',
          relatedArtifactIds: ['IF-001'],
          customerRequirementIds: ['CR-001'],
          status: 'Draft',
          baNote: 'ok',
        },
      ],
      interfaces: [
        {
          externalId: 'IF-001',
          name: 'Entra',
          interfaceType: 'SSO',
          customerRequirementIds: ['CR-001'],
        },
      ],
      dataEntities: [{ externalId: 'DATA-001', entity: 'PR' }],
      glossary: [{ term: 'PR', definition: 'Phiếu yêu cầu' }],
      businessGoals: [],
      businessRules: [],
      businessProcesses: [],
      useCases: [],
    });

    assert.equal(payload.scope.length, 1);
    assert.deepEqual(payload.scope[0].customerRequirementIds, ['CR-001']);
    assert.equal(payload.scope[0].source, 'Workshop');
    assert.equal(payload.scope[0].dateRaised, '2026-09-15');
    assert.equal(payload.scope[0].status, 'Draft');
    assert.equal(payload.scope[0].baNote, 'Analyzed:2026-09-22');

    assert.equal(payload.assumptions[0].text, 'Entra groups mapped');
    assert.equal(payload.assumptions[0].assumption, 'Entra groups mapped');
    assert.deepEqual(payload.assumptions[0].customerRequirementIds, ['CR-001']);
    assert.deepEqual(payload.assumptions[0].relatedArtifactIds, ['IF-001']);

    assert.equal(payload.interfaces[0].externalId, 'IF-001');
    assert.equal(payload.dataEntities[0].externalId, 'DATA-001');
    assert.equal(payload.glossary[0].term, 'PR');
  });

  it('maps FR Dependency/Assumption/Constraint onto pack nodes for seed', () => {
    const payload = mapParsedToPackPayload({
      overview: {},
      scope: [],
      functionalRequirements: [
        {
          externalId: 'FR-001',
          level: 'Requirement',
          name: 'Create PR',
          description: 'Save PR',
          frDependencies: 'FR-004',
          assumption: 'SSO up',
          constraintsNotes: 'Only SSO',
          brIds: ['BR-001'],
          bpmIds: ['BPM-001'],
          customerRequirementIds: ['CR-003'],
        },
      ],
      nonFunctionalRequirements: [],
      assumptions: [],
      businessGoals: [],
      businessRules: [],
      businessProcesses: [],
      useCases: [],
    });
    const fr = payload.functionalRequirements[0];
    assert.equal(fr.frDependencies, 'FR-004');
    assert.equal(fr.assumption, 'SSO up');
    assert.equal(fr.constraintsNotes, 'Only SSO');
    assert.deepEqual(fr.brIds, ['BR-001']);
  });

  it('maps businessGoals analysis fields including CR ids', () => {
    const payload = mapParsedToPackPayload({
      overview: {},
      scope: [],
      functionalRequirements: [],
      nonFunctionalRequirements: [],
      assumptions: [],
      businessGoals: [
        {
          externalId: 'BG-001',
          title: 'Số hóa PR',
          statement: 'Số hóa PR',
          businessProblem: 'Giấy/Zalo',
          expectedBusinessOutcome: 'Self-serve',
          successMetric: '>=90%',
          customerRequirementIds: ['CR-001', 'CR-002'],
        },
      ],
      businessRules: [],
      businessProcesses: [],
      useCases: [],
    });
    assert.deepEqual(payload.businessGoals[0].customerRequirementIds, ['CR-001', 'CR-002']);
    assert.equal(payload.businessGoals[0].businessProblem, 'Giấy/Zalo');
    assert.equal(payload.businessGoals[0].expectedBusinessOutcome, 'Self-serve');
  });
});
