'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildRequirementFrSlices,
  buildRequirementFrSlicesForAnalysis,
} = require('../src/utils/aiAnalysis/aiAnalysisFrSlice');

describe('buildRequirementFrSlicesForAnalysis', () => {
  const packModulesFeaturesOnly = {
    functionalRequirements: [
      {
        externalId: 'M1',
        level: 'Module',
        name: 'Attendance',
      },
      {
        externalId: 'F1',
        level: 'Feature',
        name: 'GPS Check-in',
        parentExternalId: 'M1',
        moduleLabel: 'Attendance',
      },
    ],
  };

  it('T1: pack without Requirement rows + accepted proposal → slices.length ≥ 1', () => {
    assert.equal(buildRequirementFrSlices(packModulesFeaturesOnly).length, 0);

    const hierarchy = {
      proposedRequirements: [
        {
          proposalId: 'PROP-R-F1-1',
          parentExternalId: 'F1',
          name: 'Capture GPS on check-in',
          description: 'Record lat/lng when employee checks in',
          moduleLabel: 'Attendance',
          featureLabel: 'GPS Check-in',
          status: 'accepted',
        },
      ],
    };

    const slices = buildRequirementFrSlicesForAnalysis(packModulesFeaturesOnly, hierarchy);
    assert.ok(slices.length >= 1);
    assert.equal(slices[0].id, 'PROP-R-F1-1');
    assert.equal(slices[0].source, 'hierarchy_proposal');
    assert.equal(slices[0].title, 'Capture GPS on check-in');
    assert.equal(slices[0].module, 'Attendance');
    assert.equal(slices[0].feature, 'GPS Check-in');
  });

  it('rejected proposals are excluded', () => {
    const hierarchy = {
      proposedRequirements: [
        {
          proposalId: 'PROP-R-F1-rej',
          parentExternalId: 'F1',
          name: 'Rejected req',
          status: 'rejected',
        },
        {
          proposalId: 'PROP-R-F1-ok',
          parentExternalId: 'F1',
          name: 'Pending req',
          status: 'pending',
        },
      ],
    };

    const slices = buildRequirementFrSlicesForAnalysis(packModulesFeaturesOnly, hierarchy);
    assert.equal(slices.length, 1);
    assert.equal(slices[0].id, 'PROP-R-F1-ok');
  });

  it('dedupes when pack already has same parent + name', () => {
    const pack = {
      functionalRequirements: [
        ...packModulesFeaturesOnly.functionalRequirements,
        {
          externalId: 'REQ-1',
          level: 'Requirement',
          name: 'Capture GPS on check-in',
          parentExternalId: 'F1',
          moduleLabel: 'Attendance',
          featureLabel: 'GPS Check-in',
        },
      ],
    };
    const hierarchy = {
      proposedRequirements: [
        {
          proposalId: 'PROP-R-F1-1',
          parentExternalId: 'F1',
          name: 'Capture GPS on check-in',
          status: 'accepted',
        },
      ],
    };

    const slices = buildRequirementFrSlicesForAnalysis(pack, hierarchy);
    assert.equal(slices.length, 1);
    assert.equal(slices[0].id, 'REQ-1');
    assert.equal(slices[0].source, undefined);
  });

  it('unions pack Requirements with additional proposals', () => {
    const pack = {
      functionalRequirements: [
        ...packModulesFeaturesOnly.functionalRequirements,
        {
          externalId: 'REQ-1',
          level: 'Requirement',
          name: 'Existing leaf',
          parentExternalId: 'F1',
        },
      ],
    };
    const hierarchy = {
      proposedRequirements: [
        {
          proposalId: 'PROP-R-F1-2',
          parentExternalId: 'F1',
          name: 'Extra proposed leaf',
          status: 'accepted',
        },
      ],
    };

    const slices = buildRequirementFrSlicesForAnalysis(pack, hierarchy);
    assert.equal(slices.length, 2);
    assert.ok(slices.some((s) => s.id === 'REQ-1'));
    assert.ok(slices.some((s) => s.id === 'PROP-R-F1-2' && s.source === 'hierarchy_proposal'));
  });
});
